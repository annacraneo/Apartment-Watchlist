import { db } from "@workspace/db";
import {
  listingsTable,
  listingSnapshotsTable,
  listingChangesTable,
  notificationsTable,
} from "@workspace/db";
import { eq, ne, and } from "drizzle-orm";
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

  const scrapeResult = await scrapeUrl(
    listing.listingUrl,
    listing.listingType === "rent" ? "rent" : "buy",
  );

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
  const lockedFields = new Set<string>(JSON.parse(listing.lockedFields || "[]"));
  const previousPrice = listing.currentPrice;
  const newPrice = lockedFields.has("currentPrice")
    ? listing.currentPrice
    : newData.currentPrice;
  const lockedConflicts: string[] = [];
  const apply = <T>(field: string, incoming: T | null | undefined, existing: T | null) => {
    if (lockedFields.has(field)) {
      if (incoming != null && incoming !== existing) lockedConflicts.push(field);
      return existing;
    }
    return (incoming ?? existing) as T | null;
  };

  await db
    .update(listingsTable)
    .set({
      sourceSite: apply("sourceSite", newData.sourceSite, listing.sourceSite),
      title: apply("title", newData.title, listing.title),
      address: apply("address", newData.address, listing.address),
      neighborhood: apply("neighborhood", newData.neighborhood, listing.neighborhood),
      city: apply("city", newData.city, listing.city),
      province: apply("province", newData.province, listing.province),
      postalCode: apply("postalCode", newData.postalCode, listing.postalCode),
      latitude: apply("latitude", newData.latitude, listing.latitude),
      longitude: apply("longitude", newData.longitude, listing.longitude),
      previousPrice: previousPrice,
      currentPrice: newPrice,
      priceDelta: computePriceDelta(newPrice, previousPrice),
      currency: apply("currency", newData.currency, listing.currency),
      bedrooms: apply("bedrooms", newData.bedrooms, listing.bedrooms),
      bathrooms: apply("bathrooms", newData.bathrooms, listing.bathrooms),
      squareFeet: apply("squareFeet", newData.squareFeet, listing.squareFeet),
      propertyType: apply("propertyType", newData.propertyType, listing.propertyType),
      floor: apply("floor", newData.floor, listing.floor),
      yearBuilt: apply("yearBuilt", newData.yearBuilt, listing.yearBuilt),
      condoFees: apply("condoFees", newData.condoFees, listing.condoFees),
      taxes: apply("taxes", newData.taxes, listing.taxes),
      furnishedStatus: apply("furnishedStatus", newData.furnishedStatus, listing.furnishedStatus),
      leaseTerm: apply("leaseTerm", newData.leaseTerm, listing.leaseTerm),
      availableFrom: apply("availableFrom", newData.availableFrom, listing.availableFrom),
      petsAllowedInfo: apply("petsAllowedInfo", newData.petsAllowedInfo, listing.petsAllowedInfo),
      appliancesIncluded: apply("appliancesIncluded", newData.appliancesIncluded, listing.appliancesIncluded),
      airConditioning: apply("airConditioning", newData.airConditioning, listing.airConditioning),
      extractionConfidence: apply("extractionConfidence", newData.extractionConfidence, listing.extractionConfidence),
      extractionWarnings: apply("extractionWarnings", newData.extractionWarnings, listing.extractionWarnings),
      rawContent: apply("rawContent", newData.rawContent, listing.rawContent),
      parkingInfo: apply("parkingInfo", newData.parkingInfo, listing.parkingInfo),
      listingStatus: apply("listingStatus", newData.listingStatus, listing.listingStatus),
      daysOnMarket: apply("daysOnMarket", newData.daysOnMarket, listing.daysOnMarket),
      description: apply("description", newData.description, listing.description),
      brokerName: apply("brokerName", newData.brokerName, listing.brokerName),
      brokerage: apply("brokerage", newData.brokerage, listing.brokerage),
      mainImageUrl: apply("mainImageUrl", newData.mainImageUrl, listing.mainImageUrl),
      allImageUrls: apply("allImageUrls", newData.allImageUrls, listing.allImageUrls),
      rawData: apply("rawData", newData.rawData, listing.rawData),
      lastCheckedAt: new Date(),
    })
    .where(eq(listingsTable.id, listingId));

  if (lockedConflicts.length > 0) {
    await createNotification(
      listingId,
      "locked_field_conflict",
      `New extraction differs from locked fields: ${lockedConflicts.join(", ")}. Keeping your manual values.`,
    );
  }

  // Always recompute metro proximity so walking times stay accurate across
  // algorithm improvements and coordinate updates. Haversine is instant;
  // OSRM self-disables after first timeout so there's no per-listing latency.
  try {
    const metro = await computeMetroProximity(
      newData.latitude ?? listing.latitude,
      newData.longitude ?? listing.longitude,
      newData.address ?? listing.address,
      newData.city ?? listing.city,
      newData.province ?? listing.province,
      newData.neighborhood ?? listing.neighborhood,
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

export interface CheckAllResult {
  checked: number;
  totalChanges: number;
  changes: Array<{
    address: string | null;
    changeType: string;
    fieldName: string;
    oldValue: string | null;
    newValue: string | null;
  }>;
}

export async function checkAllListings(): Promise<CheckAllResult> {
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

  // Only check non-hidden, non-unavailable listings
  // Unavailable listings are preserved as-is and skipped from periodic re-checks
  const listings = await db
    .select()
    .from(listingsTable)
    .where(and(eq(listingsTable.hidden, false), ne(listingsTable.listingStatus, "unavailable")));

  let totalChanges = 0;
  const allChanges: CheckAllResult["changes"] = [];

  for (const listing of listings) {
    const result = await checkListing(listing.id, prefs);
    totalChanges += result.changesDetected;
    for (const c of result.changes) {
      allChanges.push({
        address: listing.address,
        changeType: c.changeType,
        fieldName: c.fieldName,
        oldValue: c.oldValue,
        newValue: c.newValue,
      });
    }
    // Small delay between requests to be polite to servers
    await new Promise((r) => setTimeout(r, 500));
  }

  return { checked: listings.length, totalChanges, changes: allChanges };
}
