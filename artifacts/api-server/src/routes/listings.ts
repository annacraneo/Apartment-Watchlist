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
import { scrapeUrl, validateListingUrl } from "../services/scraper.js";
import { checkListing, checkAllListings } from "../services/checker.js";
import { computePriceDelta } from "../parsers/shared.js";
import { computeMetroProximity } from "../services/metroService.js";

const router: IRouter = Router();

// GET /listings
router.get("/listings", async (req, res): Promise<void> => {
  const {
    source,
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

  if (source) conditions.push(eq(listingsTable.sourceSite, source));
  if (status) conditions.push(eq(listingsTable.listingStatus, status));
  if (interestLevel) conditions.push(eq(listingsTable.interestLevel, interestLevel));
  if (neighborhood) conditions.push(eq(listingsTable.neighborhood, neighborhood));
  if (parkingInfo) conditions.push(eq(listingsTable.parkingInfo, parkingInfo));

  if (hasPriceDrop === "true") {
    conditions.push(sql`${listingsTable.priceDelta}::numeric < 0`);
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

  const sortCol: Column = validSortFields[sortBy || "updatedAt"] ?? listingsTable.updatedAt;
  // visitNext listings always float to the top, then sort by the chosen column
  query = query.orderBy(desc(listingsTable.visitNext), sortDir === "asc" ? asc(sortCol) : desc(sortCol));

  const listings = await query;
  res.json(listings);
});

// POST /listings
router.post("/listings", async (req, res): Promise<void> => {
  const parsed = CreateListingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { listingUrl, notes, personalRating, tags, interestLevel } = parsed.data;

  // Validate URL is from an allowed source (SSRF prevention)
  const urlError = validateListingUrl(listingUrl.trim());
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
      notes: notes || null,
      personalRating: personalRating || null,
      tags: tags || null,
      interestLevel: interestLevel || null,
      listingStatus: "checking",
    })
    .returning();

  // Scrape asynchronously (don't block response)
  scrapeUrl(listingUrl.trim())
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

        await db
          .update(listingsTable)
          .set({
            sourceSite: data.sourceSite,
            externalListingId: data.externalListingId,
            title: data.title,
            address: data.address,
            neighborhood: data.neighborhood,
            city: data.city,
            province: data.province,
            postalCode: data.postalCode,
            latitude: data.latitude,
            longitude: data.longitude,
            currentPrice: data.currentPrice,
            currency: data.currency || "CAD",
            bedrooms: data.bedrooms,
            bathrooms: data.bathrooms,
            squareFeet: data.squareFeet,
            propertyType: data.propertyType,
            floor: data.floor,
            yearBuilt: data.yearBuilt,
            condoFees: data.condoFees,
            taxes: data.taxes,
            parkingInfo: data.parkingInfo,
            listingStatus: data.listingStatus || "active",
            daysOnMarket: data.daysOnMarket,
            description: data.description,
            brokerName: data.brokerName,
            brokerage: data.brokerage,
            mainImageUrl: data.mainImageUrl,
            allImageUrls: data.allImageUrls,
            rawData: data.rawData,
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
          const metro = await computeMetroProximity(data.latitude, data.longitude, data.address);
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
  const result = changes.filter((c) => {
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

  const updateData: Record<string, unknown> = {};
  const b = body.data;
  if (b.personalRating !== undefined) updateData.personalRating = b.personalRating;
  if (b.interestLevel !== undefined) updateData.interestLevel = b.interestLevel;
  if (b.notes !== undefined) updateData.notes = b.notes;
  if (b.tags !== undefined) updateData.tags = b.tags;
  if (b.hidden !== undefined) updateData.hidden = b.hidden;
  if (b.favorite !== undefined) updateData.favorite = b.favorite;
  if (b.visitNext !== undefined) updateData.visitNext = b.visitNext;

  const [listing] = await db
    .update(listingsTable)
    .set(updateData)
    .where(eq(listingsTable.id, params.data.id))
    .returning();

  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
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
