import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { notificationsTable, listingsTable } from "@workspace/db";
import { MarkNotificationReadParams } from "@workspace/api-zod";

const router: IRouter = Router();

// GET /notifications
router.get("/notifications", async (req, res): Promise<void> => {
  const { unreadOnly } = req.query as Record<string, string | undefined>;

  let query = db
    .select({
      id: notificationsTable.id,
      listingId: notificationsTable.listingId,
      type: notificationsTable.type,
      message: notificationsTable.message,
      read: notificationsTable.read,
      createdAt: notificationsTable.createdAt,
      listingTitle: listingsTable.title,
      listingUrl: listingsTable.listingUrl,
    })
    .from(notificationsTable)
    .leftJoin(listingsTable, eq(notificationsTable.listingId, listingsTable.id))
    .$dynamic();

  if (unreadOnly === "true") {
    query = query.where(eq(notificationsTable.read, false));
  }

  const notifications = await query.orderBy(desc(notificationsTable.createdAt)).limit(100);
  res.json(notifications);
});

// POST /notifications/read-all
router.post("/notifications/read-all", async (_req, res): Promise<void> => {
  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(eq(notificationsTable.read, false));

  res.json({ success: true });
});

// PATCH /notifications/:id/read
router.patch("/notifications/:id/read", async (req, res): Promise<void> => {
  const params = MarkNotificationReadParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [notification] = await db
    .update(notificationsTable)
    .set({ read: true })
    .where(eq(notificationsTable.id, params.data.id))
    .returning();

  if (!notification) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }

  res.json({
    ...notification,
    listingTitle: null,
    listingUrl: null,
  });
});

export default router;
