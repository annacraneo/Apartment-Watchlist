import { Router, type IRouter } from "express";
import { eq, desc, asc, and, ne, sql, inArray, type Column } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  listingsTable,
  listingSnapshotsTable,
  listingChangesTable,
  notificationsTable,
} from "@workspace/db";
import {
  CreateListingBody,
  UpdateListingBody,
  GetListingParams,
  UpdateListingParams,
  DeleteListingParams,
  CheckListingParams,
  GetListingChangesParams,
  GetListingSnapshotsParams,
  BulkDeleteListingsBody,
} from "@workspace/api-zod";
import { logger } from "../lib/logger.js";
import { scrapeUrl, validateListingUrl, fetchListingImage } from "../services/scraper.js";
import { checkListing, checkAllListings } from "../services/checker.js";
import { computePriceDelta } from "../parsers/shared.js";
import { computeMetroProximity } from "../services/metroService.js";

const router: IRouter = Router();

// GET /listings
router.get("/listings", async (req, res): Promise<void> => {
  try {
  const {
    listingType,
    source,
    maxRent,
    petsAllowed,
    availableBy,
    status,
    interestLevel,
    neighborhood,
    parkingInfo,
    hasPriceDrop,
    archived,
    search,
    sortBy,
    sortDir,
  } = req.query as Record<string, string | undefined>;

  let query = db.select().from(listingsTable).$dynamic();

  const conditions = [];

  if (listingType) conditions.push(eq(listingsTable.listingType, listingType));
  if (source) conditions.push(eq(listingsTable.sourceSite, source));
  if (status) conditions.push(eq(listingsTable.listingStatus, status));
  if (petsAllowed) {
    if (petsAllowed === "cats_only" || petsAllowed === "cats_allowed") {
      conditions.push(sql`${listingsTable.petsAllowedInfo} IN ('cats_only', 'cats_allowed')`);
    } else if (petsAllowed === "cats_and_dogs" || petsAllowed === "cats_and_dogs_allowed") {
      conditions.push(sql`${listingsTable.petsAllowedInfo} IN ('cats_and_dogs', 'cats_and_dogs_allowed')`);
    } else if (petsAllowed === "all_pets" || petsAllowed === "pets_allowed") {
      conditions.push(sql`${listingsTable.petsAllowedInfo} IN ('all_pets', 'pets_allowed', 'pet_friendly_unspecified')`);
    } else if (petsAllowed === "pet_friendly") {
      conditions.push(sql`${listingsTable.petsAllowedInfo} IN ('cats_only', 'cats_allowed', 'cats_and_dogs', 'cats_and_dogs_allowed', 'all_pets', 'pets_allowed', 'pet_friendly_unspecified')`);
    } else if (petsAllowed === "no_pets" || petsAllowed === "not_allowed") {
      conditions.push(sql`${listingsTable.petsAllowedInfo} IN ('no_pets', 'not_allowed')`);
    }
  }
  if (availableBy) {
    conditions.push(sql`${listingsTable.availableFrom} <= ${availableBy}`);
  }
  if (interestLevel) conditions.push(eq(listingsTable.interestLevel, interestLevel));
  if (neighborhood) conditions.push(eq(listingsTable.neighborhood, neighborhood));
  if (parkingInfo) conditions.push(eq(listingsTable.parkingInfo, parkingInfo));

  if (hasPriceDrop === "true") {
    conditions.push(sql`${listingsTable.priceDelta}::numeric < 0`);
  }
  if (maxRent) {
    conditions.push(
      sql`CAST(NULLIF(REGEXP_REPLACE(COALESCE(${listingsTable.currentPrice}, ''), '[^0-9.]', '', 'g'), '') AS NUMERIC) <= ${maxRent}`,
    );
  }

  if (archived === "true") {
    conditions.push(eq(listingsTable.hidden, true));
  } else if (archived !== "all") {
    conditions.push(eq(listingsTable.hidden, false));
  }

  if (search) {
    const term = `%${search}%`;
    conditions.push(
      sql`(
        ${listingsTable.title} ILIKE ${term} OR
        ${listingsTable.address} ILIKE ${term} OR
        ${listingsTable.neighborhood} ILIKE ${term} OR
        ${listingsTable.city} ILIKE ${term} OR
        ${listingsTable.notes} ILIKE ${term}
      )`
    );
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const validSortFields: Record<string, Column> = {
    firstSavedAt: listingsTable.firstSavedAt,
    updatedAt: listingsTable.updatedAt,
    lastCheckedAt: listingsTable.lastCheckedAt,
    currentPrice: listingsTable.currentPrice,
    priceDelta: listingsTable.priceDelta,
    interestLevel: listingsTable.interestLevel,
    walkingMinutes: listingsTable.walkingMinutes,
    bedrooms: listingsTable.bedrooms,
    squareFeet: listingsTable.squareFeet,
  };

  // interestLevel needs a custom CASE order (high=3 > medium=2 > low=1 > null=0)
  if (sortBy === "interestLevel") {
    const interestOrder = sql`CASE ${listingsTable.interestLevel} WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END`;
    query = query.orderBy(desc(listingsTable.visitNext), sortDir === "asc" ? asc(interestOrder) : desc(interestOrder));
  } else if (sortBy === "squareFeet") {
    const squareFeetNumeric = sql`CAST(${listingsTable.squareFeet} AS NUMERIC)`;
    query = query.orderBy(desc(listingsTable.visitNext), sortDir === "asc" ? asc(squareFeetNumeric) : desc(squareFeetNumeric));
  } else if (sortBy === "currentPrice") {
    const currentPriceNumeric = sql`CAST(${listingsTable.currentPrice} AS NUMERIC)`;
    query = query.orderBy(desc(listingsTable.visitNext), sortDir === "asc" ? asc(currentPriceNumeric) : desc(currentPriceNumeric));
  } else if (sortBy === "priceDelta") {
    const priceDeltaNumeric = sql`CAST(${listingsTable.priceDelta} AS NUMERIC)`;
    query = query.orderBy(desc(listingsTable.visitNext), sortDir === "asc" ? asc(priceDeltaNumeric) : desc(priceDeltaNumeric));
  } else if (sortBy === "bedrooms") {
    const bedroomsNumeric = sql`CAST(${listingsTable.bedrooms} AS NUMERIC)`;
    query = query.orderBy(desc(listingsTable.visitNext), sortDir === "asc" ? asc(bedroomsNumeric) : desc(bedroomsNumeric));
  } else {
    const sortCol: Column = validSortFields[sortBy || "updatedAt"] ?? listingsTable.updatedAt;
    // visitNext listings always float to the top, then sort by the chosen column
    query = query.orderBy(desc(listingsTable.visitNext), sortDir === "asc" ? asc(sortCol) : desc(sortCol));
  }

  const listings = await query;
  res.json(listings);
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "Failed to fetch listings");
    res.status(500).json({ error: details });
  }
});

// POST /listings/preview-extraction
router.post("/listings/preview-extraction", async (req, res): Promise<void> => {
  const parsed = CreateListingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const listingUrl = parsed.data.listingUrl?.trim();
  const listingType = parsed.data.listingType ?? "buy";
  const urlError = validateListingUrl(listingUrl, listingType);
  if (urlError) {
    res.status(400).json({ error: urlError });
    return;
  }

  const scrape = await scrapeUrl(listingUrl, listingType);
  res.json(scrape);
});

// POST /listings
router.post("/listings", async (req, res): Promise<void> => {
  const parsed = CreateListingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { listingUrl, notes, personalRating, tags, interestLevel, listingType } = parsed.data;
  const effectiveListingType = listingType ?? "buy";

  // Validate URL is from an allowed source (SSRF prevention)
  const urlError = validateListingUrl(listingUrl.trim(), effectiveListingType);
  if (urlError) {
    res.status(400).json({ error: urlError });
    return;
  }

  // Duplicate URL check
  const existing = await db
    .select()
    .from(listingsTable)
    .where(eq(listingsTable.listingUrl, listingUrl.trim()));

  if (existing.length > 0) {
    res.status(409).json({ error: "This listing URL is already in your watchlist." });
    return;
  }

  req.log.info({ url: listingUrl }, "Adding new listing");

  // Create placeholder row first
  const [listing] = await db
    .insert(listingsTable)
    .values({
      listingUrl: listingUrl.trim(),
      listingType: effectiveListingType,
      notes: notes || null,
      personalRating: personalRating || null,
      tags: tags || null,
      interestLevel: interestLevel || null,
      listingStatus: "checking",
    })
    .returning();

  // Rent listings skip the background scrape: the preview-extraction step already ran it,
  // and the user's review PATCH will arrive momentarily with all locked fields.
  // Running scrape again would race against that PATCH and could overwrite user edits.
  if (effectiveListingType === "rent") {
    const [freshRentListing] = await db
      .select()
      .from(listingsTable)
      .where(eq(listingsTable.id, listing.id));
    res.status(201).json(freshRentListing);
    return;
  }

  // Scrape asynchronously (don't block response) — buy listings only
  scrapeUrl(listingUrl.trim(), effectiveListingType)
    .then(async (result) => {
      if (result.success && result.data) {
        const data = result.data;

        // Content-based duplicate check: same address + sqft = same unit, different URL
        if (data.address && data.squareFeet) {
          const dupes = await db
            .select({ id: listingsTable.id, listingUrl: listingsTable.listingUrl })
            .from(listingsTable)
            .where(
              and(
                ne(listingsTable.id, listing.id),
                eq(listingsTable.hidden, false),
                sql`LOWER(TRIM(${listingsTable.address})) = LOWER(TRIM(${data.address}))`,
                eq(listingsTable.squareFeet, data.squareFeet),
              )
            );

          if (dupes.length > 0) {
            const original = dupes[0];
            logger.warn(
              { originalId: original.id, newId: listing.id, address: data.address },
              "Duplicate listing detected — removing new entry",
            );
            await db.delete(listingsTable).where(eq(listingsTable.id, listing.id));
            await db.insert(notificationsTable).values({
              listingId: original.id,
              type: "duplicate_detected",
              message: `Duplicate blocked: "${data.address}" (${data.squareFeet} sqft) is already in your watchlist. The new URL was not added.`,
            });
            return;
          }
        }

        const [currentListing] = await db
          .select()
          .from(listingsTable)
          .where(eq(listingsTable.id, listing.id));
        if (!currentListing) return;

        const lockedFields = new Set<string>(JSON.parse(currentListing.lockedFields || "[]"));
        const apply = <T>(field: string, incoming: T | null | undefined, existing: T | null) => {
          if (lockedFields.has(field)) return existing;
          return (incoming ?? existing) as T | null;
        };

        await db
          .update(listingsTable)
          .set({
            sourceSite: apply("sourceSite", data.sourceSite, currentListing.sourceSite),
            externalListingId: apply("externalListingId", data.externalListingId, currentListing.externalListingId),
            title: apply("title", data.title, currentListing.title),
            address: apply("address", data.address, currentListing.address),
            neighborhood: apply("neighborhood", data.neighborhood, currentListing.neighborhood),
            city: apply("city", data.city, currentListing.city),
            province: apply("province", data.province, currentListing.province),
            postalCode: apply("postalCode", data.postalCode, currentListing.postalCode),
            latitude: apply("latitude", data.latitude, currentListing.latitude),
            longitude: apply("longitude", data.longitude, currentListing.longitude),
            currentPrice: apply("currentPrice", data.currentPrice, currentListing.currentPrice),
            currency: apply("currency", data.currency || "CAD", currentListing.currency),
            bedrooms: apply("bedrooms", data.bedrooms, currentListing.bedrooms),
            bathrooms: apply("bathrooms", data.bathrooms, currentListing.bathrooms),
            squareFeet: apply("squareFeet", data.squareFeet, currentListing.squareFeet),
            propertyType: apply("propertyType", data.propertyType, currentListing.propertyType),
            floor: apply("floor", data.floor, currentListing.floor),
            yearBuilt: apply("yearBuilt", data.yearBuilt, currentListing.yearBuilt),
            condoFees: apply("condoFees", data.condoFees, currentListing.condoFees),
            taxes: apply("taxes", data.taxes, currentListing.taxes),
            furnishedStatus: apply("furnishedStatus", data.furnishedStatus, currentListing.furnishedStatus),
            leaseTerm: apply("leaseTerm", data.leaseTerm, currentListing.leaseTerm),
            availableFrom: apply("availableFrom", data.availableFrom, currentListing.availableFrom),
            petsAllowedInfo: apply("petsAllowedInfo", data.petsAllowedInfo, currentListing.petsAllowedInfo),
            appliancesIncluded: apply("appliancesIncluded", data.appliancesIncluded, currentListing.appliancesIncluded),
            airConditioning: apply("airConditioning", data.airConditioning, currentListing.airConditioning),
            extractionConfidence: apply("extractionConfidence", data.extractionConfidence, currentListing.extractionConfidence),
            extractionWarnings: apply("extractionWarnings", data.extractionWarnings, currentListing.extractionWarnings),
            rawContent: apply("rawContent", data.rawContent, currentListing.rawContent),
            parkingInfo: apply("parkingInfo", data.parkingInfo, currentListing.parkingInfo),
            listingStatus: apply("listingStatus", data.listingStatus || "active", currentListing.listingStatus),
            daysOnMarket: apply("daysOnMarket", data.daysOnMarket, currentListing.daysOnMarket),
            description: apply("description", data.description, currentListing.description),
            brokerName: apply("brokerName", data.brokerName, currentListing.brokerName),
            brokerage: apply("brokerage", data.brokerage, currentListing.brokerage),
            mainImageUrl: apply("mainImageUrl", data.mainImageUrl, currentListing.mainImageUrl),
            allImageUrls: apply("allImageUrls", data.allImageUrls, currentListing.allImageUrls),
            rawData: apply("rawData", data.rawData, currentListing.rawData),
            lastCheckedAt: new Date(),
          })
          .where(eq(listingsTable.id, listing.id));

        // Initial snapshot
        await db.insert(listingSnapshotsTable).values({
          listingId: listing.id,
          extractedData: JSON.stringify(data),
          listingStatus: data.listingStatus,
          currentPrice: data.currentPrice,
          fetchSuccess: true,
        });

        // Compute nearest metro station
        try {
          const metro = await computeMetroProximity(data.latitude, data.longitude, data.address, data.city, data.province, data.neighborhood);
          if (metro) {
            await db
              .update(listingsTable)
              .set({ nearestMetro: metro.name, walkingMinutes: metro.walkingMinutes })
              .where(eq(listingsTable.id, listing.id));
          }
        } catch (err) {
          logger.warn({ id: listing.id, err }, "Metro proximity computation failed");
        }
      } else {
        await db
          .update(listingsTable)
          .set({ listingStatus: "unavailable", lastCheckedAt: new Date() })
          .where(eq(listingsTable.id, listing.id));
      }
    })
    .catch((err) => {
      logger.error({ id: listing.id, err }, "Background scrape failed");
    });

  const [freshListing] = await db
    .select()
    .from(listingsTable)
    .where(eq(listingsTable.id, listing.id));

  res.status(201).json(freshListing);
});

// POST /listings/check-all
router.post("/listings/check-all", async (req, res): Promise<void> => {
  const result = await checkAllListings();
  res.json(result);
});

// GET /listings/recent-price-changes?days=60
router.get("/listings/recent-price-changes", async (req, res): Promise<void> => {
  const days = Math.min(parseInt((req.query.days as string) || "60", 10) || 60, 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const changes = await db
    .select()
    .from(listingChangesTable)
    .where(
      and(
        sql`${listingChangesTable.changeType} IN ('price_drop', 'price_increase')`,
        sql`${listingChangesTable.changedAt} >= ${since}`,
      )
    )
    .orderBy(desc(listingChangesTable.changedAt));

  const seen = new Set<number>();
  const result = changes.filter((c: (typeof changes)[number]) => {
    if (seen.has(c.listingId)) return false;
    seen.add(c.listingId);
    return true;
  });

  res.json(result);
});

// GET /listings/:id
router.get("/listings/:id", async (req, res): Promise<void> => {
  const params = GetListingParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [listing] = await db
    .select()
    .from(listingsTable)
    .where(eq(listingsTable.id, params.data.id));

  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  res.json(listing);
});

// PATCH /listings/:id
router.patch("/listings/:id", async (req, res): Promise<void> => {
  const params = UpdateListingParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateListingBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const b = body.data;

  // Read the pre-update record so we can detect real address changes and current status.
  const [preListing] = await db
    .select()
    .from(listingsTable)
    .where(eq(listingsTable.id, params.data.id));

  if (!preListing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (b.personalRating !== undefined) updateData.personalRating = b.personalRating;
  if (b.interestLevel !== undefined) updateData.interestLevel = b.interestLevel;
  if (b.notes !== undefined) updateData.notes = b.notes;
  if (b.tags !== undefined) updateData.tags = b.tags;
  if (b.hidden !== undefined) updateData.hidden = b.hidden;
  if (b.favorite !== undefined) updateData.favorite = b.favorite;
  if (b.visitNext !== undefined) updateData.visitNext = b.visitNext;
  if (b.visited !== undefined) updateData.visited = b.visited;
  if (b.bedrooms !== undefined) updateData.bedrooms = b.bedrooms;
  if (b.bathrooms !== undefined) updateData.bathrooms = b.bathrooms;
  if (b.squareFeet !== undefined) updateData.squareFeet = b.squareFeet;
  if (b.furnishedStatus !== undefined) updateData.furnishedStatus = b.furnishedStatus;
  if (b.leaseTerm !== undefined) updateData.leaseTerm = b.leaseTerm;
  if (b.availableFrom !== undefined) updateData.availableFrom = b.availableFrom;
  if (b.petsAllowedInfo !== undefined) updateData.petsAllowedInfo = b.petsAllowedInfo;
  if (b.appliancesIncluded !== undefined) updateData.appliancesIncluded = b.appliancesIncluded;
  if (b.airConditioning !== undefined) updateData.airConditioning = b.airConditioning;
  if (b.currentPrice !== undefined) updateData.currentPrice = b.currentPrice;
  if (b.address !== undefined) updateData.address = b.address;
  if (b.neighborhood !== undefined) updateData.neighborhood = b.neighborhood;
  if (b.parkingInfo !== undefined) updateData.parkingInfo = b.parkingInfo;
  if (b.nearestMetro !== undefined) updateData.nearestMetro = b.nearestMetro;
  if (b.lockedFields !== undefined) {
    updateData.lockedFields = JSON.stringify(b.lockedFields ?? []);
    // When locked fields arrive (review save), activate a rent listing that is still "checking"
    if (preListing.listingStatus === "checking" && preListing.listingType === "rent") {
      updateData.listingStatus = "active";
    }
  }

  const [listing] = await db
    .update(listingsTable)
    .set(updateData)
    .where(eq(listingsTable.id, params.data.id))
    .returning();

  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  // Recompute metro when address actually changed (compare to pre-update value),
  // or when nearestMetro is explicitly cleared.
  const newAddress = b.address;
  const oldAddress = preListing.address;
  const addressActuallyChanged =
    newAddress !== undefined &&
    newAddress !== null &&
    newAddress.trim() !== "" &&
    newAddress.trim() !== (oldAddress ?? "").trim();
  const metroExplicitlyCleared = b.nearestMetro === null || b.nearestMetro === "";
  if (addressActuallyChanged || metroExplicitlyCleared) {
    try {
      const metro = await computeMetroProximity(
        listing.latitude,
        listing.longitude,
        listing.address,
        listing.city,
        listing.province,
        listing.neighborhood,
      );
      if (metro) {
        const [metroUpdated] = await db
          .update(listingsTable)
          .set({ nearestMetro: metro.name, walkingMinutes: metro.walkingMinutes })
          .where(eq(listingsTable.id, params.data.id))
          .returning();
        res.json(metroUpdated);
        return;
      }
    } catch (err) {
      logger.warn({ id: listing.id, err }, "Metro recomputation after update failed");
    }
  }

  // If this is a review save (lockedFields present) and there's no image yet,
  // kick off a background Jina fetch to get the listing photo.
  if (b.lockedFields && !listing.mainImageUrl && listing.listingUrl) {
    const listingId = listing.id;
    const listingUrl = listing.listingUrl;
    setImmediate(async () => {
      try {
        const imageUrl = await fetchListingImage(listingUrl);
        if (imageUrl) {
          await db
            .update(listingsTable)
            .set({ mainImageUrl: imageUrl })
            .where(eq(listingsTable.id, listingId));
          logger.info({ id: listingId, imageUrl }, "Background image fetch completed");
        }
      } catch (err) {
        logger.warn({ id: listingId, err }, "Background image fetch failed");
      }
    });
  }

  res.json(listing);
});

// DELETE /listings/:id
router.delete("/listings/:id", async (req, res): Promise<void> => {
  const params = DeleteListingParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(listingsTable)
    .where(eq(listingsTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  res.sendStatus(204);
});

// POST /listings/:id/check
router.post("/listings/:id/check", async (req, res): Promise<void> => {
  const params = CheckListingParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [listing] = await db
    .select()
    .from(listingsTable)
    .where(eq(listingsTable.id, params.data.id));

  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  const result = await checkListing(params.data.id);

  const [updatedListing] = await db
    .select()
    .from(listingsTable)
    .where(eq(listingsTable.id, params.data.id));

  res.json({
    listing: updatedListing,
    changesDetected: result.changesDetected,
    changes: result.changes,
  });
});

// GET /listings/:id/changes
router.get("/listings/:id/changes", async (req, res): Promise<void> => {
  const params = GetListingChangesParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const changes = await db
    .select()
    .from(listingChangesTable)
    .where(eq(listingChangesTable.listingId, params.data.id))
    .orderBy(desc(listingChangesTable.changedAt));

  res.json(changes);
});

// GET /listings/:id/snapshots
router.get("/listings/:id/snapshots", async (req, res): Promise<void> => {
  const params = GetListingSnapshotsParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const snapshots = await db
    .select()
    .from(listingSnapshotsTable)
    .where(eq(listingSnapshotsTable.listingId, params.data.id))
    .orderBy(desc(listingSnapshotsTable.checkedAt))
    .limit(20);

  res.json(snapshots);
});

// POST /listings/:id/price-history  — manually log a historical price change
router.post("/listings/:id/price-history", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid listing id" });
    return;
  }

  const { oldPrice, newPrice, changedAt } = req.body as Record<string, string | undefined>;
  if (!oldPrice || !newPrice || typeof oldPrice !== "string" || typeof newPrice !== "string") {
    res.status(400).json({ error: "oldPrice and newPrice are required strings" });
    return;
  }

  const oldNum = Number(oldPrice.replace(/[^0-9.]/g, ""));
  const newNum = Number(newPrice.replace(/[^0-9.]/g, ""));
  const changeType = newNum < oldNum ? "price_drop" : "price_increase";

  const changedAtDate = changedAt ? new Date(changedAt) : new Date();

  const [inserted] = await db
    .insert(listingChangesTable)
    .values({
      listingId: id,
      fieldName: "currentPrice",
      oldValue: oldPrice,
      newValue: newPrice,
      changeType,
      changedAt: changedAtDate,
    })
    .returning();

  logger.info({ listingId: id, changeType, oldPrice, newPrice, changedAt: changedAtDate }, "Manual price change recorded");
  res.json(inserted);
});

// POST /listings/bulk-delete
router.post("/listings/bulk-delete", async (req, res): Promise<void> => {
  const parsed = BulkDeleteListingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { ids } = parsed.data;

  const deleted = await db
    .delete(listingsTable)
    .where(inArray(listingsTable.id, ids))
    .returning({ id: listingsTable.id });

  res.json({ deleted: deleted.length });
});

export default router;
