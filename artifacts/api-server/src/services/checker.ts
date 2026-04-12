import { db } from "@workspace/db";
import {
  listingsTable,
  listingSnapshotsTable,
  listingChangesTable,
  notificationsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { scrapeUrl } from "./scraper.js";
import { diffListings, changesToInserts } from "./diffEngine.js";
import { computePriceDelta } from "../parsers/shared.js";
import { getSettings } from "./settingsService.js";
import { computeMetroProximity } from "./metroService.js";

export interface CheckResult {
  success: boolean;
  changesDetected: number;
  changes: typeof listingChangesTable.$inferSelect[];
  error?: string;
}

export async function checkListing(
  listingId: number,
  notifyPrefs?: { notifyOnPriceDrop: boolean; notifyOnStatusChange: boolean; notifyOnUnavailable: boolean },
): Promise<CheckResult> {
  const [listing] = await db
    .select()
    .from(listingsTable)
    .where(eq(listingsTable.id, listingId));

  if (!listing) {
    return { success: false, changesDetected: 0, changes: [], error: "Listing not found" };
  }

  logger.info({ listingId, url: listing.listingUrl }, "Checking listing");

  const scrapeResult = await scrapeUrl(listing.listingUrl);

  // Load notification preferences if not provided (single-listing check path)
  let prefs = notifyPrefs;
  if (!prefs) {
    try {
      const settings = await getSettings();
      prefs = {
        notifyOnPriceDrop: settings.notifyOnPriceDrop,
        notifyOnStatusChange: settings.notifyOnStatusChange,
        notifyOnUnavailable: settings.notifyOnUnavailable,
      };
    } catch {
      prefs = { notifyOnPriceDrop: true, notifyOnStatusChange: true, notifyOnUnavailable: true };
    }
  }

  // Record snapshot
  await db.insert(listingSnapshotsTable).values({
    listingId,
    extractedData: scrapeResult.data ? JSON.stringify(scrapeResult.data) : null,
    listingStatus: scrapeResult.data?.listingStatus || null,
    currentPrice: scrapeResult.data?.currentPrice || null,
    fetchSuccess: scrapeResult.success,
    errorMessage: scrapeResult.errorMessage,
  });

  if (!scrapeResult.success || !scrapeResult.data) {
    const wasUnavailable = listing.listingStatus === "unavailable";

    // Mark as unavailable
    await db
      .update(listingsTable)
      .set({ listingStatus: "unavailable", lastCheckedAt: new Date() })
      .where(eq(listingsTable.id, listingId));

    // Record a change row for this status transition (for auditable history)
    if (!wasUnavailable) {
      await db.insert(listingChangesTable).values({
        listingId,
        fieldName: "listingStatus",
        oldValue: listing.listingStatus ?? "active",
        newValue: "unavailable",
        changeType: "status_change",
      });
    }

    // Create notification if status changed and user wants these
    if (!wasUnavailable && prefs.notifyOnUnavailable) {
      await createNotification(
        listingId,
        "unavailable",
        `Listing "${listing.title || listing.listingUrl}" is no longer reachable: ${scrapeResult.errorMessage}`,
      );
    }

    return {
      success: false,
      changesDetected: wasUnavailable ? 0 : 1,
      changes: [],
      error: scrapeResult.errorMessage || "Fetch failed",
    };
  }

  // Compare with previous state
  const previous: Record<string, unknown> = { ...listing };
  const current: Record<string, unknown> = { ...scrapeResult.data };

  const detectedChanges = diffListings(previous, current);

  let insertedChanges: typeof listingChangesTable.$inferSelect[] = [];

  if (detectedChanges.length > 0) {
    const inserts = changesToInserts(listingId, detectedChanges);
    insertedChanges = await db.insert(listingChangesTable).values(inserts).returning();
    logger.info({ listingId, changes: detectedChanges.length }, "Changes detected");

    // Create notifications for significant changes, gated by user preferences
    for (const change of detectedChanges) {
      if (change.changeType === "price_drop" && prefs.notifyOnPriceDrop) {
        await createNotification(
          listingId,
          "price_drop",
          `Price dropped for "${listing.title || listing.listingUrl}": ${change.oldValue} → ${change.newValue}`,
        );
      } else if (change.changeType === "price_increase" && prefs.notifyOnPriceDrop) {
        await createNotification(
          listingId,
          "price_increase",
          `Price increased for "${listing.title || listing.listingUrl}": ${change.oldValue} → ${change.newValue}`,
        );
      } else if (
        (change.changeType === "status_change" ||
          change.changeType === "removed" ||
          change.changeType === "restored") &&
        prefs.notifyOnStatusChange
      ) {
        await createNotification(
          listingId,
          change.changeType,
          `Status changed for "${listing.title || listing.listingUrl}": ${change.oldValue} → ${change.newValue}`,
        );
      }
    }
  }

  // Update listing with new extracted data
  const newData = scrapeResult.data;
  const previousPrice = listing.currentPrice;
  const newPrice = newData.currentPrice;

  await db
    .update(listingsTable)
    .set({
      sourceSite: newData.sourceSite ?? listing.sourceSite,
      title: newData.title ?? listing.title,
      address: newData.address ?? listing.address,
      neighborhood: newData.neighborhood ?? listing.neighborhood,
      city: newData.city ?? listing.city,
      province: newData.province ?? listing.province,
      postalCode: newData.postalCode ?? listing.postalCode,
      latitude: newData.latitude ?? listing.latitude,
      longitude: newData.longitude ?? listing.longitude,
      previousPrice: previousPrice,
      currentPrice: newPrice ?? listing.currentPrice,
      priceDelta: computePriceDelta(newPrice, previousPrice),
      currency: newData.currency ?? listing.currency,
      bedrooms: newData.bedrooms ?? listing.bedrooms,
      bathrooms: newData.bathrooms ?? listing.bathrooms,
      squareFeet: newData.squareFeet ?? listing.squareFeet,
      propertyType: newData.propertyType ?? listing.propertyType,
      floor: newData.floor ?? listing.floor,
      yearBuilt: newData.yearBuilt ?? listing.yearBuilt,
      condoFees: newData.condoFees ?? listing.condoFees,
      taxes: newData.taxes ?? listing.taxes,
      parkingInfo: newData.parkingInfo ?? listing.parkingInfo,
      listingStatus: newData.listingStatus ?? listing.listingStatus,
      daysOnMarket: newData.daysOnMarket ?? listing.daysOnMarket,
      description: newData.description ?? listing.description,
      brokerName: newData.brokerName ?? listing.brokerName,
      brokerage: newData.brokerage ?? listing.brokerage,
      mainImageUrl: newData.mainImageUrl ?? listing.mainImageUrl,
      allImageUrls: newData.allImageUrls ?? listing.allImageUrls,
      rawData: newData.rawData ?? listing.rawData,
      lastCheckedAt: new Date(),
    })
    .where(eq(listingsTable.id, listingId));

  // Compute metro proximity if not already stored
  if (!listing.nearestMetro) {
    try {
      const metro = await computeMetroProximity(
        newData.latitude ?? listing.latitude,
        newData.longitude ?? listing.longitude,
        newData.address ?? listing.address,
      );
      if (metro) {
        await db
          .update(listingsTable)
          .set({ nearestMetro: metro.name, walkingMinutes: metro.walkingMinutes })
          .where(eq(listingsTable.id, listingId));
      }
    } catch (err) {
      logger.warn({ listingId, err }, "Metro proximity computation failed");
    }
  }

  return {
    success: true,
    changesDetected: insertedChanges.length,
    changes: insertedChanges,
  };
}

async function createNotification(listingId: number, type: string, message: string) {
  try {
    await db.insert(notificationsTable).values({ listingId, type, message });
  } catch (err) {
    logger.error({ listingId, type, err }, "Failed to create notification");
  }
}

export async function checkAllListings(): Promise<{ checked: number; totalChanges: number }> {
  // Load notification preferences once for the entire batch run
  let prefs: { notifyOnPriceDrop: boolean; notifyOnStatusChange: boolean; notifyOnUnavailable: boolean };
  try {
    const settings = await getSettings();
    prefs = {
      notifyOnPriceDrop: settings.notifyOnPriceDrop,
      notifyOnStatusChange: settings.notifyOnStatusChange,
      notifyOnUnavailable: settings.notifyOnUnavailable,
    };
  } catch {
    prefs = { notifyOnPriceDrop: true, notifyOnStatusChange: true, notifyOnUnavailable: true };
  }

  // Only check non-hidden (non-archived) listings
  const listings = await db
    .select()
    .from(listingsTable)
    .where(eq(listingsTable.hidden, false));

  let totalChanges = 0;
  for (const listing of listings) {
    const result = await checkListing(listing.id, prefs);
    totalChanges += result.changesDetected;
    // Small delay between requests to be polite to servers
    await new Promise((r) => setTimeout(r, 500));
  }

  return { checked: listings.length, totalChanges };
}
