import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { listingsTable } from "./listings";

export const listingSnapshotsTable = pgTable("listing_snapshots", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull().references(() => listingsTable.id, { onDelete: "cascade" }),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  extractedData: text("extracted_data"),
  listingStatus: text("listing_status"),
  currentPrice: text("current_price"),
  fetchSuccess: boolean("fetch_success").notNull().default(true),
  errorMessage: text("error_message"),
});

export const insertListingSnapshotSchema = createInsertSchema(listingSnapshotsTable).omit({
  id: true,
  checkedAt: true,
});
export type InsertListingSnapshot = z.infer<typeof insertListingSnapshotSchema>;
export type ListingSnapshot = typeof listingSnapshotsTable.$inferSelect;
