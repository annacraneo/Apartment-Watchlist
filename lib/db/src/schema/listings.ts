import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const listingsTable = pgTable("listings", {
  id: serial("id").primaryKey(),
  listingUrl: text("listing_url").notNull().unique(),
  sourceSite: text("source_site"),
  externalListingId: text("external_listing_id"),
  title: text("title"),
  address: text("address"),
  neighborhood: text("neighborhood"),
  city: text("city"),
  province: text("province"),
  postalCode: text("postal_code"),
  latitude: text("latitude"),
  longitude: text("longitude"),
  currentPrice: text("current_price"),
  previousPrice: text("previous_price"),
  priceDelta: text("price_delta"),
  currency: text("currency"),
  bedrooms: text("bedrooms"),
  bathrooms: text("bathrooms"),
  squareFeet: text("square_feet"),
  propertyType: text("property_type"),
  floor: text("floor"),
  yearBuilt: text("year_built"),
  condoFees: text("condo_fees"),
  taxes: text("taxes"),
  listingStatus: text("listing_status"),
  daysOnMarket: text("days_on_market"),
  description: text("description"),
  brokerName: text("broker_name"),
  brokerage: text("brokerage"),
  mainImageUrl: text("main_image_url"),
  allImageUrls: text("all_image_urls"),
  personalRating: integer("personal_rating"),
  interestLevel: text("interest_level"),
  notes: text("notes"),
  tags: text("tags"),
  hidden: boolean("hidden").notNull().default(false),
  favorite: boolean("favorite").notNull().default(false),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  firstSavedAt: timestamp("first_saved_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  rawData: text("raw_data"),
});

export const insertListingSchema = createInsertSchema(listingsTable).omit({
  id: true,
  firstSavedAt: true,
  updatedAt: true,
});
export type InsertListing = z.infer<typeof insertListingSchema>;
export type Listing = typeof listingsTable.$inferSelect;
