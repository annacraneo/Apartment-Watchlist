import app from "./app";
import { logger } from "./lib/logger";
import { startScheduler } from "./services/scheduler.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Start the periodic listing checker scheduler
  try {
    await startScheduler();
  } catch (schedulerErr) {
    logger.error({ err: schedulerErr }, "Failed to start scheduler");
  }
});
