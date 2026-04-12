import { logger } from "../lib/logger.js";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { checkAllListings } from "./checker.js";

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

async function getCheckIntervalHours(): Promise<number> {
  try {
    const rows = await db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.key, "check_interval_hours"));
    const val = parseInt(rows[0]?.value || "12", 10);
    return isNaN(val) || val < 1 ? 12 : val;
  } catch {
    return 12;
  }
}

async function runScheduledCheck() {
  if (isRunning) {
    logger.info("Scheduled check already running, skipping");
    return;
  }

  isRunning = true;
  logger.info("Running scheduled listing check");

  try {
    const result = await checkAllListings();
    logger.info(result, "Scheduled check complete");
  } catch (err) {
    logger.error({ err }, "Scheduled check failed");
  } finally {
    isRunning = false;
  }
}

export async function startScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  const hours = await getCheckIntervalHours();
  const ms = hours * 60 * 60 * 1000;

  logger.info({ intervalHours: hours }, "Starting listing scheduler");

  schedulerInterval = setInterval(runScheduledCheck, ms);
}

export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info("Scheduler stopped");
  }
}

export async function restartScheduler() {
  stopScheduler();
  await startScheduler();
}
