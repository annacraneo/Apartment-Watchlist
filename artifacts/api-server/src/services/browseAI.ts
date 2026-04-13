import { logger } from "../lib/logger.js";
import { db } from "@workspace/db";
import { settingsTable, listingChangesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { type NormalizedListing, emptyNormalized, normalizePrice } from "../parsers/shared.js";

export { emptyNormalized } from "../parsers/shared.js";

export interface PriceEvent {
  price: string;
  date?: string;
  event?: string;
}

export interface PriceHistoryResult {
  originalPrice: string | null;
  priceReduced: boolean;
  priceHistory: PriceEvent[];
}

export interface BrowseAiSettings {
  enabled: boolean;
  apiKey: string | null;
  robotId: string | null;
  webhookSecret: string | null;
}

export async function getBrowseAiSettings(): Promise<BrowseAiSettings> {
  try {
    const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, "browse_ai_api_key"));
    const robotRows = await db.select().from(settingsTable).where(eq(settingsTable.key, "browse_ai_robot_id"));
    const secretRows = await db.select().from(settingsTable).where(eq(settingsTable.key, "browse_ai_webhook_secret"));

    const apiKey = rows[0]?.value || null;
    const robotId = robotRows[0]?.value || null;
    const webhookSecret = secretRows[0]?.value || null;

    // `enabled` reflects whether credentials are present and usable.
    // The caller is responsible for deciding WHEN to use Browse AI
    // (based on the resolved extraction mode, not the global default).
    return {
      enabled: !!apiKey && !!robotId,
      apiKey,
      robotId,
      webhookSecret,
    };
  } catch {
    return { enabled: false, apiKey: null, robotId: null, webhookSecret: null };
  }
}

export async function fetchViaBrowseAi(
  url: string,
  settings: BrowseAiSettings,
): Promise<NormalizedListing | null> {
  if (!settings.apiKey || !settings.robotId) return null;

  try {
    // Trigger a Browse AI task run
    const runResponse = await fetch(
      `https://api.browse.ai/v2/robots/${settings.robotId}/tasks`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${settings.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputParameters: { originUrl: url } }),
      },
    );

    if (!runResponse.ok) {
      throw new Error(`Browse AI run failed: ${runResponse.status}`);
    }

    const runData = (await runResponse.json()) as { result?: { id?: string } };
    const taskId = runData?.result?.id;
    if (!taskId) throw new Error("Browse AI did not return a task ID");

    // Poll for result (max 5 attempts, 3s apart)
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 3000));

      const taskResponse = await fetch(
        `https://api.browse.ai/v2/robots/${settings.robotId}/tasks/${taskId}`,
        {
          headers: { Authorization: `Bearer ${settings.apiKey}` },
        },
      );

      if (!taskResponse.ok) continue;

      const taskData = (await taskResponse.json()) as {
        result?: {
          status?: string;
          capturedLists?: Record<string, unknown[]>;
          capturedTexts?: Record<string, string>;
        };
      };
      const status = taskData?.result?.status;

      if (status === "successful") {
        return parseBrowseAiPayload(taskData.result, url);
      } else if (status === "failed") {
        throw new Error("Browse AI task failed");
      }
    }

    throw new Error("Browse AI task timed out");
  } catch (err) {
    logger.error({ url, err }, "Browse AI fetch error");
    return null;
  }
}

export function parseBrowseAiPayload(
  payload: unknown,
  url: string,
): NormalizedListing {
  const result = emptyNormalized();
  result.rawData = JSON.stringify({ source: "browse_ai", url, payload, extractedAt: new Date().toISOString() });

  if (!payload || typeof payload !== "object") return result;

  const p = payload as Record<string, unknown>;
  const texts = (p.capturedTexts || {}) as Record<string, string>;
  const lists = (p.capturedLists || {}) as Record<string, unknown[]>;

  // Map common Browse AI field names
  result.title = texts["title"] || texts["property_title"] || null;
  result.currentPrice = texts["price"] || texts["asking_price"] || null;
  result.address = texts["address"] || texts["street_address"] || null;
  result.city = texts["city"] || null;
  result.province = texts["province"] || texts["state"] || null;
  result.postalCode = texts["postal_code"] || texts["zip"] || null;
  result.bedrooms = texts["bedrooms"] || texts["beds"] || null;
  result.bathrooms = texts["bathrooms"] || texts["baths"] || null;
  result.squareFeet = texts["square_feet"] || texts["sqft"] || null;
  result.description = texts["description"] || null;
  result.listingStatus = texts["status"] || "active";
  result.propertyType = texts["property_type"] || null;

  const images = lists["images"] as Array<{ url?: string; src?: string }> | undefined;
  if (images && images.length > 0) {
    result.mainImageUrl = images[0]?.url || images[0]?.src || null;
    result.allImageUrls = JSON.stringify(images.slice(0, 20).map((i) => i.url || i.src).filter(Boolean));
  }

  // Detect source from URL
  if (/centris\.(ca|com)/i.test(url)) result.sourceSite = "centris";
  else if (/realtor\.ca/i.test(url)) result.sourceSite = "realtor";
  else result.sourceSite = "browse_ai";

  return result;
}

export function validateWebhookSecret(
  receivedSecret: string | undefined,
  expectedSecret: string | null,
): boolean {
  if (!expectedSecret) return true; // No secret configured = open
  return receivedSecret === expectedSecret;
}

/**
 * Parse price history data from a Browse AI task payload.
 *
 * Browse AI robots can capture various price-related fields depending on how
 * the robot was configured. This function reads the most common field name
 * conventions and returns a unified PriceHistoryResult.
 *
 * Expected captured texts (any of these work):
 *   original_price | initial_price | previous_price | list_price | original_asking_price
 *   price_reduced  | prix_reduit  ("true"/"yes"/"oui")
 *
 * Expected captured lists (any of these work):
 *   price_history | price_changes | historique_prix
 *   Each item: { price, date?, event? } or { prix, date?, evenement? }
 */
export function parsePriceHistoryFromPayload(payload: unknown): PriceHistoryResult {
  const result: PriceHistoryResult = { originalPrice: null, priceReduced: false, priceHistory: [] };

  if (!payload || typeof payload !== "object") return result;
  const p = payload as Record<string, unknown>;
  const texts = (p.capturedTexts || {}) as Record<string, string>;
  const lists = (p.capturedLists || {}) as Record<string, unknown[]>;

  // Try multiple field name conventions for original / pre-reduction price
  const originalRaw =
    texts["original_price"] ||
    texts["initial_price"] ||
    texts["previous_price"] ||
    texts["list_price"] ||
    texts["original_asking_price"] ||
    texts["prix_original"] ||
    texts["prix_initial"] ||
    null;

  if (originalRaw) {
    const normalized = normalizePrice(originalRaw);
    if (normalized) result.originalPrice = normalized;
  }

  // Price-reduced indicator
  const priceReducedRaw = texts["price_reduced"] || texts["prix_reduit"] || texts["price_lowered"] || "";
  if (/^(true|yes|oui|1)$/i.test(priceReducedRaw.trim())) {
    result.priceReduced = true;
  }

  // Price history list
  const historyList =
    lists["price_history"] ||
    lists["price_changes"] ||
    lists["historique_prix"] ||
    lists["price_history_items"] ||
    null;

  if (Array.isArray(historyList)) {
    for (const item of historyList) {
      if (!item || typeof item !== "object") continue;
      const i = item as Record<string, string>;
      const rawPrice = i["price"] || i["prix"] || i["amount"] || i["montant"] || "";
      const normalized = normalizePrice(rawPrice);
      if (normalized) {
        result.priceHistory.push({
          price: normalized,
          date: i["date"] || i["date_changed"] || undefined,
          event: i["event"] || i["evenement"] || i["type"] || undefined,
        });
      }
    }
  }

  return result;
}

/**
 * Use Browse AI to fetch a listing page and extract price history data.
 * Returns null if Browse AI is not configured or the fetch fails.
 */
export async function fetchPriceHistoryViaBrowseAi(
  url: string,
  settings: BrowseAiSettings,
): Promise<PriceHistoryResult | null> {
  if (!settings.apiKey || !settings.robotId) return null;

  try {
    const runResponse = await fetch(
      `https://api.browse.ai/v2/robots/${settings.robotId}/tasks`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${settings.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputParameters: { originUrl: url } }),
      },
    );

    if (!runResponse.ok) {
      throw new Error(`Browse AI run failed: ${runResponse.status}`);
    }

    const runData = (await runResponse.json()) as { result?: { id?: string } };
    const taskId = runData?.result?.id;
    if (!taskId) throw new Error("Browse AI did not return a task ID");

    // Poll for result (max 5 attempts, 3s apart)
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 3000));

      const taskResponse = await fetch(
        `https://api.browse.ai/v2/robots/${settings.robotId}/tasks/${taskId}`,
        { headers: { Authorization: `Bearer ${settings.apiKey}` } },
      );

      if (!taskResponse.ok) continue;

      const taskData = (await taskResponse.json()) as {
        result?: { status?: string; capturedLists?: Record<string, unknown[]>; capturedTexts?: Record<string, string> };
      };
      const status = taskData?.result?.status;

      if (status === "successful") {
        return parsePriceHistoryFromPayload(taskData.result);
      } else if (status === "failed") {
        throw new Error("Browse AI task failed");
      }
    }

    throw new Error("Browse AI task timed out");
  } catch (err) {
    logger.error({ url, err }, "Browse AI price history fetch error");
    return null;
  }
}

/**
 * Fire-and-forget: after a listing is first added, use Browse AI to check
 * for price history (reduced price, original asking price, etc.) and
 * record any findings as listing_changes rows with changeType "historical_price".
 *
 * Safe to call without await — errors are swallowed and logged.
 */
export async function enrichWithBrowseAiPriceHistory(
  listingId: number,
  url: string,
  currentPrice: string | null,
  browseAiSettings: BrowseAiSettings,
): Promise<void> {
  if (!browseAiSettings.enabled) return;

  logger.info({ listingId, url }, "Enriching listing with Browse AI price history");

  const history = await fetchPriceHistoryViaBrowseAi(url, browseAiSettings);
  if (!history) return;

  const currentNorm = normalizePrice(currentPrice);
  const changes: { fieldName: string; oldValue: string | null; newValue: string | null; changeType: string }[] = [];

  // If Browse AI found an original price different from the current scraped price
  if (history.originalPrice && currentNorm && history.originalPrice !== currentNorm) {
    const origNum = parseFloat(history.originalPrice);
    const currNum = parseFloat(currentNorm);
    if (!isNaN(origNum) && !isNaN(currNum) && origNum > currNum) {
      changes.push({
        fieldName: "currentPrice",
        oldValue: history.originalPrice,
        newValue: currentNorm,
        changeType: "historical_price",
      });
    }
  }

  // If Browse AI returned a full price history list, insert each entry in chronological order
  if (history.priceHistory.length > 0) {
    // Sort oldest first if dates are present
    const sorted = [...history.priceHistory].sort((a, b) => {
      if (!a.date || !b.date) return 0;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

    for (let i = 0; i < sorted.length - 1; i++) {
      const prev = sorted[i];
      const next = sorted[i + 1];
      if (!prev || !next) continue;
      const p = parseFloat(prev.price);
      const n = parseFloat(next.price);
      if (isNaN(p) || isNaN(n) || p === n) continue;

      changes.push({
        fieldName: "currentPrice",
        oldValue: prev.price,
        newValue: next.price,
        changeType: "historical_price",
      });
    }
  }

  if (changes.length > 0) {
    await db.insert(listingChangesTable).values(
      changes.map((c) => ({ listingId, ...c })),
    );
    logger.info({ listingId, priceEvents: changes.length }, "Inserted historical price events from Browse AI");
  } else {
    logger.info({ listingId }, "Browse AI price history fetch completed — no prior price changes found");
  }
}
