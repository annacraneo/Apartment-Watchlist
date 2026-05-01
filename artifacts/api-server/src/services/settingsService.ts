import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const DEFAULT_SETTINGS = {
  checkIntervalHours: 12,
  extractionMode: "native",
  browseAiApiKey: null as string | null,
  browseAiRobotId: null as string | null,
  browseAiWebhookSecret: null as string | null,
  centrisExtractionMode: null as string | null,
  realtorExtractionMode: null as string | null,
  notifyOnPriceDrop: true,
  notifyOnStatusChange: true,
  notifyOnUnavailable: true,
  llmProvider: "disabled" as "disabled" | "ollama" | "openrouter" | "openai_compatible",
  llmModel: "qwen2.5:7b-instruct" as string | null,
};

type Settings = typeof DEFAULT_SETTINGS;

const KEY_MAP: Record<keyof Settings, string> = {
  checkIntervalHours: "check_interval_hours",
  extractionMode: "extraction_mode",
  browseAiApiKey: "browse_ai_api_key",
  browseAiRobotId: "browse_ai_robot_id",
  browseAiWebhookSecret: "browse_ai_webhook_secret",
  centrisExtractionMode: "centris_extraction_mode",
  realtorExtractionMode: "realtor_extraction_mode",
  notifyOnPriceDrop: "notify_on_price_drop",
  notifyOnStatusChange: "notify_on_status_change",
  notifyOnUnavailable: "notify_on_unavailable",
  llmProvider: "llm_provider",
  llmModel: "llm_model",
};

export async function getSettings(): Promise<Settings> {
  const rows = await db.select().from(settingsTable);
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }

  return {
    checkIntervalHours: parseInt(map[KEY_MAP.checkIntervalHours] || "12", 10),
    extractionMode: map[KEY_MAP.extractionMode] || "native",
    browseAiApiKey: map[KEY_MAP.browseAiApiKey] || null,
    browseAiRobotId: map[KEY_MAP.browseAiRobotId] || null,
    browseAiWebhookSecret: map[KEY_MAP.browseAiWebhookSecret] || null,
    centrisExtractionMode: map[KEY_MAP.centrisExtractionMode] || null,
    realtorExtractionMode: map[KEY_MAP.realtorExtractionMode] || null,
    notifyOnPriceDrop: map[KEY_MAP.notifyOnPriceDrop] !== "false",
    notifyOnStatusChange: map[KEY_MAP.notifyOnStatusChange] !== "false",
    notifyOnUnavailable: map[KEY_MAP.notifyOnUnavailable] !== "false",
    llmProvider:
      (["ollama", "openrouter", "openai_compatible"] as const).includes(map[KEY_MAP.llmProvider] as never)
        ? (map[KEY_MAP.llmProvider] as "ollama" | "openrouter" | "openai_compatible")
        : "disabled",
    llmModel: map[KEY_MAP.llmModel] || DEFAULT_SETTINGS.llmModel,
  };
}

export async function saveSettings(updates: Partial<Settings>): Promise<Settings> {
  for (const [key, value] of Object.entries(updates) as [keyof Settings, unknown][]) {
    const dbKey = KEY_MAP[key];
    if (!dbKey) continue;

    const strValue = value == null ? "" : String(value);

    const existing = await db.select().from(settingsTable).where(eq(settingsTable.key, dbKey));
    if (existing.length > 0) {
      await db
        .update(settingsTable)
        .set({ value: strValue })
        .where(eq(settingsTable.key, dbKey));
    } else {
      await db.insert(settingsTable).values({ key: dbKey, value: strValue });
    }
  }

  return getSettings();
}
