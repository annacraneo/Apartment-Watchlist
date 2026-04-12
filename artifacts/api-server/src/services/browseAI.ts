import { logger } from "../lib/logger.js";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { type NormalizedListing, emptyNormalized } from "../parsers/shared.js";

export { emptyNormalized } from "../parsers/shared.js";

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
