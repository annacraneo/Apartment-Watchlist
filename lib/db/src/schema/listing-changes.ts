import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { listingsTable } from "./listings";

export const listingChangesTable = pgTable("listing_changes", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull().references(() => listingsTable.id, { onDelete: "cascade" }),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  fieldName: text("field_name").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changeType: text("change_type").notNull(),
});

export const insertListingChangeSchema = createInsertSchema(listingChangesTable).omit({
  id: true,
  changedAt: true,
});
export type InsertListingChange = z.infer<typeof insertListingChangeSchema>;
export type ListingChange = typeof listingChangesTable.$inferSelect;
