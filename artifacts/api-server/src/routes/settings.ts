import { Router, type IRouter } from "express";
import { UpdateSettingsBody } from "@workspace/api-zod";
import { getSettings, saveSettings } from "../services/settingsService.js";
import { restartScheduler } from "../services/scheduler.js";

const router: IRouter = Router();

// GET /settings
router.get("/settings", async (_req, res): Promise<void> => {
  const settings = await getSettings();
  res.json(settings);
});

// PUT /settings
router.put("/settings", async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updated = await saveSettings(parsed.data as Record<string, unknown>);

  // Restart scheduler if interval changed
  await restartScheduler();

  res.json(updated);
});

export default router;
