import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  listingsTable,
  listingSnapshotsTable,
  listingChangesTable,
  notificationsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { getBrowseAiSettings, parseBrowseAiPayload, validateWebhookSecret } from "../services/browseAI.js";
import { diffListings, changesToInserts } from "../services/diffEngine.js";
import { computePriceDelta } from "../parsers/shared.js";
import { getSettings } from "../services/settingsService.js";

const router: IRouter = Router();

// POST /browse-ai/webhook
router.post("/browse-ai/webhook", async (req, res): Promise<void> => {
  const settings = await getBrowseAiSettings();

  // Validate secret if configured
  const receivedSecret = req.headers["x-browse-ai-secret"] as string | undefined;
  if (!validateWebhookSecret(receivedSecret, settings.webhookSecret)) {
    res.status(401).json({ error: "Invalid webhook secret" });
    return;
  }

  const payload = req.body as Record<string, unknown>;
  logger.info({ payloadKeys: Object.keys(payload) }, "Browse AI webhook received");

  // Extract URL from payload to find matching listing
  const url =
    (payload.originUrl as string) ||
    (payload.inputParameters as Record<string, unknown> | undefined)?.originUrl as string ||
    null;

  if (!url) {
    res.json({ success: true, message: "No URL in payload, ignored" });
    return;
  }

  // Find the listing
  const [listing] = await db
    .select()
    .from(listingsTable)
    .where(eq(listingsTable.listingUrl, url));

  if (!listing) {
    res.json({ success: true, message: "No matching listing found" });
    return;
  }

  // Parse the Browse AI payload
  const extracted = parseBrowseAiPayload(payload.result || payload, url);

  // Record snapshot for auditability (mirrors checker-driven updates)
  await db.insert(listingSnapshotsTable).values({
    listingId: listing.id,
    extractedData: JSON.stringify(extracted),
    listingStatus: extracted.listingStatus || null,
    currentPrice: extracted.currentPrice || null,
    fetchSuccess: true,
    errorMessage: null,
  });

  // Diff against previous state to generate structured change records
  const previous: Record<string, unknown> = { ...listing };
  const current: Record<string, unknown> = { ...extracted };
  const detectedChanges = diffListings(previous, current);

  if (detectedChanges.length > 0) {
    const inserts = changesToInserts(listing.id, detectedChanges);
    await db.insert(listingChangesTable).values(inserts);
    logger.info({ listingId: listing.id, changes: detectedChanges.length }, "Changes detected from Browse AI webhook");

    // Create notifications gated by user preferences
    let notifyPrefs = { notifyOnPriceDrop: true, notifyOnStatusChange: true, notifyOnUnavailable: true };
    try {
      const appSettings = await getSettings();
      notifyPrefs = {
        notifyOnPriceDrop: appSettings.notifyOnPriceDrop,
        notifyOnStatusChange: appSettings.notifyOnStatusChange,
        notifyOnUnavailable: appSettings.notifyOnUnavailable,
      };
    } catch { /* use defaults */ }

    for (const change of detectedChanges) {
      if (change.changeType === "price_drop" && notifyPrefs.notifyOnPriceDrop) {
        await db.insert(notificationsTable).values({
          listingId: listing.id,
          type: "price_drop",
          message: `Price dropped for "${listing.title || url}": ${change.oldValue} → ${change.newValue}`,
        });
      } else if (change.changeType === "price_increase" && notifyPrefs.notifyOnPriceDrop) {
        await db.insert(notificationsTable).values({
          listingId: listing.id,
          type: "price_increase",
          message: `Price increased for "${listing.title || url}": ${change.oldValue} → ${change.newValue}`,
        });
      } else if (
        (change.changeType === "status_change" || change.changeType === "removed" || change.changeType === "restored") &&
        notifyPrefs.notifyOnStatusChange
      ) {
        await db.insert(notificationsTable).values({
          listingId: listing.id,
          type: change.changeType,
          message: `Status changed for "${listing.title || url}": ${change.oldValue} → ${change.newValue}`,
        });
      }
    }
  }

  // Update listing with new extracted data
  const previousPrice = listing.currentPrice;
  const newPrice = extracted.currentPrice;

  await db
    .update(listingsTable)
    .set({
      title: extracted.title ?? listing.title,
      currentPrice: newPrice ?? listing.currentPrice,
      previousPrice: previousPrice,
      priceDelta: computePriceDelta(newPrice, previousPrice),
      listingStatus: extracted.listingStatus ?? listing.listingStatus,
      bedrooms: extracted.bedrooms ?? listing.bedrooms,
      bathrooms: extracted.bathrooms ?? listing.bathrooms,
      squareFeet: extracted.squareFeet ?? listing.squareFeet,
      description: extracted.description ?? listing.description,
      mainImageUrl: extracted.mainImageUrl ?? listing.mainImageUrl,
      lastCheckedAt: new Date(),
    })
    .where(eq(listingsTable.id, listing.id));

  res.json({ success: true, message: "Listing updated from Browse AI webhook", changesDetected: detectedChanges.length });
});

export default router;
