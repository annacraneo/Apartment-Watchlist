/**
 * Seed script for development — populates the database with realistic
 * sample listings, snapshots, change records, and notifications.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run seed
 *
 * Safe to run multiple times; uses INSERT ... ON CONFLICT DO NOTHING.
 */

import { db } from "@workspace/db";
import {
  listingsTable,
  listingChangesTable,
  notificationsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

const SAMPLE_LISTINGS = [
  {
    listingUrl:
      "https://www.centris.ca/en/apartment-for-sale~montreal~le-plateau-mont-royal/12345678",
    sourceSite: "centris" as const,
    externalListingId: "12345678",
    title: "3½ – Le Plateau-Mont-Royal, Montreal",
    address: "4225 Rue Saint-Denis",
    neighborhood: "Le Plateau-Mont-Royal",
    city: "Montreal",
    province: "QC",
    postalCode: "H2J 2K9",
    currentPrice: "469000",
    currency: "CAD",
    bedrooms: "2",
    bathrooms: "1",
    squareFeet: "750",
    propertyType: "Condo",
    listingStatus: "active" as const,
    description:
      "Bright and spacious 3½ in the heart of the Plateau. Hardwood floors throughout, exposed brick, high ceilings. Steps from Laurier metro. Perfect for first-time buyers.",
    brokerName: "Marie-Claire Tremblay",
    brokerage: "Royal LePage",
    condoFees: "425",
    daysOnMarket: "32",
    mainImageUrl:
      "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=400",
    personalRating: 4,
    interestLevel: "high" as const,
    notes: "Love the location. Need to check the heating system.",
    tags: "plateau,condo,metro",
    hidden: false,
    favorite: true,
    previousPrice: "489000",
  },
  {
    listingUrl:
      "https://www.realtor.ca/real-estate/28765432/301-1200-rue-de-la-gauchetiere-o-montreal",
    sourceSite: "realtor" as const,
    externalListingId: "28765432",
    title: "2 bdr Condo – Quartier des Spectacles",
    address: "1200 Rue de la Gauchetière O #301",
    neighborhood: "Quartier des Spectacles",
    city: "Montreal",
    province: "QC",
    postalCode: "H3B 0A9",
    currentPrice: "549000",
    currency: "CAD",
    bedrooms: "2",
    bathrooms: "2",
    squareFeet: "920",
    propertyType: "Condo",
    listingStatus: "active" as const,
    description:
      "Modern 2-bedroom condo in a sought-after downtown building. Floor-to-ceiling windows, in-unit laundry, private terrace with city views. Building includes gym, pool, and concierge.",
    brokerName: "David Chen",
    brokerage: "Sutton Group",
    condoFees: "680",
    daysOnMarket: "12",
    mainImageUrl:
      "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400",
    personalRating: 3,
    interestLevel: "medium" as const,
    notes: "Condo fees are high. Confirm parking included.",
    tags: "downtown,views,amenities",
    hidden: false,
    favorite: false,
  },
  {
    listingUrl:
      "https://www.centris.ca/en/apartment-for-sale~rosemont~la-petite-patrie/87654321",
    sourceSite: "centris" as const,
    externalListingId: "87654321",
    title: "4½ – Rosemont–La Petite-Patrie",
    address: "5500 Boul Rosemont",
    neighborhood: "Rosemont",
    city: "Montreal",
    province: "QC",
    postalCode: "H1T 2H5",
    currentPrice: "395000",
    currency: "CAD",
    bedrooms: "3",
    bathrooms: "1",
    squareFeet: "890",
    propertyType: "Condo",
    listingStatus: "sold" as const,
    description:
      "Large 4½ in a quiet Rosemont street. Renovated kitchen, in-unit washer/dryer hook-up, large backyard access. Great school district.",
    brokerName: "Pierre Gagnon",
    brokerage: "RE/MAX",
    daysOnMarket: "58",
    mainImageUrl:
      "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=400",
    personalRating: 2,
    interestLevel: "low" as const,
    notes: "Already sold – was tracking price trend.",
    tags: "rosemont,large,sold",
    hidden: false,
    favorite: false,
    previousPrice: "425000",
  },
];

async function seed() {
  console.log("🌱 Starting seed...");

  for (const listing of SAMPLE_LISTINGS) {
    const existing = await db
      .select({ id: listingsTable.id })
      .from(listingsTable)
      .where(eq(listingsTable.listingUrl, listing.listingUrl));

    if (existing.length > 0) {
      console.log(`  ⏭  Skipping existing listing: ${listing.title}`);
      continue;
    }

    const [inserted] = await db
      .insert(listingsTable)
      .values({
        ...listing,
        firstSavedAt: new Date(),
        updatedAt: new Date(),
        lastCheckedAt: new Date(),
      })
      .returning({ id: listingsTable.id });

    if (!inserted) continue;
    const id = inserted.id;
    console.log(`  ✅ Inserted listing #${id}: ${listing.title}`);

    // Seed change history for listings that had price drops
    if (listing.previousPrice) {
      await db.insert(listingChangesTable).values([
        {
          listingId: id,
          changedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
          fieldName: "currentPrice",
          oldValue: listing.previousPrice,
          newValue: listing.currentPrice ?? null,
          changeType: "price_drop",
        },
      ]);
      console.log(`    📉 Added price drop change record`);
    }

    if (listing.listingStatus === "sold") {
      await db.insert(listingChangesTable).values([
        {
          listingId: id,
          changedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          fieldName: "listingStatus",
          oldValue: "active",
          newValue: "sold",
          changeType: "status_change",
        },
      ]);
      console.log(`    🏷️  Added status change record (sold)`);
    }

    // Seed notifications
    if (listing.previousPrice && listing.interestLevel !== "low") {
      await db.insert(notificationsTable).values({
        listingId: id,
        type: "price_drop",
        message: `Price dropped for "${listing.title}": ${listing.previousPrice} → ${listing.currentPrice} CAD`,
        read: false,
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      });
      console.log(`    🔔 Added price drop notification`);
    }

    if (listing.listingStatus === "sold") {
      await db.insert(notificationsTable).values({
        listingId: id,
        type: "status_change",
        message: `Status changed for "${listing.title}": active → sold`,
        read: true,
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      });
      console.log(`    🔔 Added status change notification`);
    }
  }

  console.log("\n✨ Seed complete.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
