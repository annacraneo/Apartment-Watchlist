import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { listingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { getBrowseAiSettings, parseBrowseAiPayload, validateWebhookSecret } from "../services/browseAI.js";
import { checkListing } from "../services/checker.js";

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

  // Parse the Browse AI payload and update
  const extracted = parseBrowseAiPayload(payload.result || payload, url);

  await db
    .update(listingsTable)
    .set({
      title: extracted.title ?? listing.title,
      currentPrice: extracted.currentPrice ?? listing.currentPrice,
      listingStatus: extracted.listingStatus ?? listing.listingStatus,
      bedrooms: extracted.bedrooms ?? listing.bedrooms,
      bathrooms: extracted.bathrooms ?? listing.bathrooms,
      squareFeet: extracted.squareFeet ?? listing.squareFeet,
      description: extracted.description ?? listing.description,
      mainImageUrl: extracted.mainImageUrl ?? listing.mainImageUrl,
      lastCheckedAt: new Date(),
    })
    .where(eq(listingsTable.id, listing.id));

  res.json({ success: true, message: "Listing updated from Browse AI webhook" });
});

export default router;
