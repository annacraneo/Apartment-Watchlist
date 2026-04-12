import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { listingsTable, listingChangesTable, notificationsTable } from "@workspace/db";
import { eq, and, gte, sql, desc } from "drizzle-orm";

const router: IRouter = Router();

// GET /dashboard/summary
router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(listingsTable)
    .where(eq(listingsTable.hidden, false));

  const [activeResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(listingsTable)
    .where(and(eq(listingsTable.hidden, false), eq(listingsTable.listingStatus, "active")));

  const [unavailableResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(listingsTable)
    .where(
      and(
        eq(listingsTable.hidden, false),
        sql`${listingsTable.listingStatus} IN ('unavailable', 'removed')`,
      ),
    );

  const [uncheckedResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(listingsTable)
    .where(and(eq(listingsTable.hidden, false), sql`${listingsTable.lastCheckedAt} IS NULL`));

  const [priceDropsResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(listingChangesTable)
    .where(
      and(
        eq(listingChangesTable.changeType, "price_drop"),
        gte(listingChangesTable.changedAt, today),
      ),
    );

  const [statusChangesResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(listingChangesTable)
    .where(
      and(
        eq(listingChangesTable.changeType, "status_change"),
        gte(listingChangesTable.changedAt, today),
      ),
    );

  const [unreadResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notificationsTable)
    .where(eq(notificationsTable.read, false));

  const recentChanges = await db
    .select()
    .from(listingChangesTable)
    .orderBy(desc(listingChangesTable.changedAt))
    .limit(10);

  res.json({
    totalListings: totalResult?.count ?? 0,
    activeListings: activeResult?.count ?? 0,
    priceDropsToday: priceDropsResult?.count ?? 0,
    statusChangesToday: statusChangesResult?.count ?? 0,
    uncheckedListings: uncheckedResult?.count ?? 0,
    unavailableListings: unavailableResult?.count ?? 0,
    unreadNotifications: unreadResult?.count ?? 0,
    recentChanges,
  });
});

export default router;
