import { logger } from "../lib/logger.js";
import { parseHtml, parseGenericHtml, type NormalizedListing } from "../parsers/index.js";
import { emptyNormalized } from "../parsers/shared.js";
import { getBrowseAiSettings, fetchViaBrowseAi } from "./browseAI.js";
import { getSettings } from "./settingsService.js";

const FETCH_TIMEOUT_MS = 15000;
const DEFAULT_LLM_TIMEOUT_MS = 7000;
const DEFAULT_LLM_MAX_INPUT_CHARS = 6000;
const DEFAULT_LLM_MIN_HEURISTIC_CONFIDENCE = 80;

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-CA,en;q=0.9,fr-CA;q=0.8,fr;q=0.7",
  "Cache-Control": "no-cache",
};

export interface ScrapeResult {
  success: boolean;
  data: NormalizedListing | null;
  errorMessage: string | null;
}

interface RentContentFetcher {
  fetch(url: string): Promise<{ html: string; jinaText: string | null; finalUrl: string }>;
}

interface RentContentCleaner {
  toMainText(html: string): string;
}

interface RentSchemaExtractor {
  extract(cleanedText: string, html: string, url: string): Partial<NormalizedListing>;
}

interface RentNormalizer {
  normalize(partial: Partial<NormalizedListing>, url: string, cleanedText: string): NormalizedListing;
}

interface RentLlmExtractor {
  extract(cleanedText: string, url: string, config: LlmRuntimeConfig, missingFields?: string[]): Promise<Partial<NormalizedListing> | null>;
}

interface LlmRuntimeConfig {
  enabled: boolean;
  provider: "ollama" | "openai_compatible";
  baseUrl: string;
  apiKey: string;
  model: string;
}

class DefaultRentContentFetcher implements RentContentFetcher {
  async fetch(url: string): Promise<{ html: string; jinaText: string | null; finalUrl: string }> {
    const jinaUrl = `https://r.jina.ai/${url}`;

    const fetchJina = async (): Promise<string | null> => {
      try {
        const r = await fetch(jinaUrl, {
          headers: { "User-Agent": DEFAULT_HEADERS["User-Agent"], Accept: "text/plain,text/markdown;q=0.9,*/*;q=0.8" },
          signal: AbortSignal.timeout(15000),
        });
        return r.ok ? await r.text() : null;
      } catch {
        return null;
      }
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: DEFAULT_HEADERS,
        signal: controller.signal,
        redirect: "follow",
      });
      if (response.ok) {
        const html = await response.text();
        // Fire Jina in background for image fallback — don't block the main flow.
        // We'll race it with a short timeout so slow Jina never delays extraction.
        const jinaText = await Promise.race([
          fetchJina(),
          new Promise<null>((r) => setTimeout(() => r(null), 10000)),
        ]);
        return { html, jinaText, finalUrl: response.url };
      }
      // Primary fetch failed — use Jina as the only source
      logger.warn({ url, status: response.status }, "Primary rent fetch failed, attempting Jina fallback");
      const jinaText = await fetchJina();
      if (!jinaText) throw new Error(`Primary HTTP ${response.status}; Jina fallback also failed`);
      return { html: `<html><body><pre>${jinaText}</pre></body></html>`, jinaText, finalUrl: jinaUrl };
    } finally {
      clearTimeout(timeout);
    }
  }
}

class DefaultRentContentCleaner implements RentContentCleaner {
  toMainText(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 12000);
  }
}

function extractFirstMoney(text: string): string | null {
  const strictMatches = [...text.matchAll(/\$\s*([\d,]{3,5})(?:\.\d{1,2})?(?:\s*\/\s*(?:mo|month))?/gi)];
  for (const m of strictMatches) {
    const raw = m[1]?.replace(/,/g, "");
    if (!raw) continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 300 && n <= 20000) return String(Math.round(n));
  }
  const loose = [...text.matchAll(/(?:rent|price|monthly|\/mo)\D{0,20}([\d,]{3,5})/gi)];
  for (const m of loose) {
    const raw = m[1]?.replace(/,/g, "");
    if (!raw) continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 300 && n <= 20000) return String(Math.round(n));
  }
  return null;
}

function extractAddress(text: string, url: string): string | null {
  // Street address pattern: number + street name + street type (English or French)
  const streetTypes = "rue|avenue|ave|street|st|boulevard|blvd|road|rd|drive|dr|lane|ln|chemin|ch|place|pl|court|ct|crescent|cres|way|terrace|terr|impasse";
  const addrRe = new RegExp(
    `\\b(\\d{1,5}(?:-\\d{1,5})?[A-Za-z]?)\\s+([A-Za-zÀ-ÿ' -]{1,50})\\s+(?:${streetTypes})\\s+([A-Za-zÀ-ÿ' -]{1,40})`,
    "i",
  );
  const m = text.match(addrRe);
  if (m) return m[0].replace(/\s+/g, " ").trim();
  // Try URL slug as last resort (some listing sites encode address in URL)
  try {
    const parsed = new URL(url);
    const slug = parsed.pathname.split("/").filter(Boolean).pop() ?? "";
    if (/^\d/.test(slug) && slug.length > 5) {
      return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
    }
  } catch { /* ignore */ }
  return null;
}

function normalizeAddressString(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw
    // Strip apartment/unit prefix: "203-2250 rue X" → "2250 rue X"
    .replace(/^\d{1,5}-(\d{1,5}\s)/, "$1")
    // Strip apt/unit designators anywhere: ", apt 4", "#203", "suite 2B"
    .replace(/,?\s*(?:apt\.?|appt\.?|app\.?|unit|suite|bureau|#|appartement)\s*[\w-]+/gi, "")
    // Strip city/province suffix after second comma: "123 rue X, Rosemont, Montreal" → "123 rue X, Rosemont"
    .replace(/,([^,]+),([^,]+)$/, (_, a) => `, ${a.trim()}`)
    // Strip parenthetical content: "(Rosemont/La Petite-Patrie)"
    .replace(/\s*\([^)]*\)/g, "")
    // Normalize whitespace and trailing commas
    .replace(/,\s*$/, "")
    .replace(/\s+/g, " ")
    .trim() || null;
}

function normalizeAddress(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = normalizeAddressString(raw);
  if (!cleaned) return null;
  // Keep the street-address portion only (drop borough/city/noise suffixes)
  const firstPart = cleaned.split(",")[0]?.trim() || cleaned;
  return firstPart || null;
}

function detectFurnished(text: string): string | null {
  if (/unfurnished/i.test(text)) return "no";
  if (/furnished/i.test(text)) return "yes";
  return null;
}

function normalizeFurnished(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (["yes", "y", "true", "furnished", "fully_furnished", "partially_furnished"].includes(value)) return "yes";
  if (["no", "n", "false", "unfurnished", "not_furnished"].includes(value)) return "no";
  return null;
}

function detectPets(text: string): string | null {
  if (/no pets|pets not allowed|cats? not allowed|dogs? not allowed/i.test(text)) return "no_pets";
  const hasCats = /\bcats?\b/i.test(text);
  const hasDogs = /\bdogs?\b/i.test(text);
  if (hasCats && hasDogs) return "cats_and_dogs";
  if (hasCats) return "cats_only";
  if (/pet friendly|pets allowed|pets welcome/i.test(text)) return "all_pets";
  return "all_pets";
}

function detectAirConditioning(text: string): string | null {
  if (/no air conditioning|without air conditioning|sans climatisation|pas de clim/i.test(text)) return "no";
  if (/air.?condition|a\/c|ac\b|climatisé|climatisation|thermopompe|heat.?pump|pompe.?chaleur/i.test(text)) return "yes";
  return null;
}

function detectLeaseTerm(text: string): string | null {
  const explicit = text.match(/lease term\s*[:\-]?\s*([a-z0-9-]{2,20})/i);
  if (explicit?.[1]) return explicit[1].trim().toLowerCase().replace(/\s+/g, "_");
  if (/month-to-month/i.test(text)) return "month_to_month";
  if (/12 month|1 year/i.test(text)) return "12_month";
  return null;
}

function detectAvailableFrom(text: string): string | null {
  // Only extract when availability is explicitly indicated.
  // This avoids false positives from random dates present in listing pages.
  const m = text.match(
    /\b(?:available|availability|disponible)\s*(?:from|on|à partir du|a partir du|dès|des)?\s*[:\-]?\s*([a-z]+\s+\d{1,2}(?:,\s*\d{4})?|\d{4}-\d{2}-\d{2})/i,
  );
  return m?.[1]?.trim() ?? null;
}

function normalizeAvailableFrom(raw: string | null | undefined, sourceText?: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;
  if (!sourceText) return null;
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const explicitPattern = new RegExp(
    `\\b(?:available|availability|disponible)\\b[\\s\\S]{0,60}(?:from|on|à partir du|a partir du|dès|des)?[\\s:\\-]{0,20}${escapedValue}`,
    "i",
  );
  const isoDatePattern = /\d{4}-\d{2}-\d{2}/.test(value)
    ? new RegExp(`\\b(?:available|availability|disponible)\\b[\\s\\S]{0,60}${escapedValue}`, "i")
    : null;
  if (explicitPattern.test(sourceText)) return value;
  if (isoDatePattern?.test(sourceText)) return value;
  return null;
}

function detectAppliances(text: string): string | null {
  const tokens = ["fridge", "stove", "dishwasher", "washer", "dryer", "microwave"];
  const present = tokens.filter((t) => new RegExp(`\\b${t}\\b`, "i").test(text));
  return present.length > 0 ? present.join(", ") : null;
}

function extractBedrooms(text: string): string | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:bed|beds|bedroom|bedrooms)\b/i);
  return m?.[1] ?? null;
}

function extractBathrooms(text: string): string | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:bath|baths|bathroom|bathrooms)\b/i);
  return m?.[1] ?? null;
}

function extractSquareFeet(text: string): string | null {
  const m = text.match(/(\d{3,5})\s*(?:sq\.?\s*ft|square\s*feet|ft²|ft2)/i);
  return m?.[1] ?? null;
}

function extractFloor(text: string): string | null {
  if (/\bground floor\b|rez-de-chauss[ée]e|rdc\b/i.test(text)) return "ground floor";
  const explicit = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s*(?:floor|fl\.?|etage|étage)\b/i);
  if (explicit?.[1]) return `${explicit[1]} floor`;
  const level = text.match(/\blevel\s*(\d{1,2})\b/i);
  if (level?.[1]) return `${level[1]} floor`;
  return null;
}

function extractNeighborhood(text: string): string | null {
  const lowered = text.toLowerCase();
  for (const [canonical, aliases] of Object.entries(MONTREAL_BOROUGH_ALIASES)) {
    if (aliases.some((alias) => lowered.includes(alias))) return canonical;
  }
  const m = text.match(/\b(?:neighbo[u]?rhood|district|area)\s*[:\-]\s*([A-Za-z0-9' .\/-]{2,80})/i);
  if (m?.[1]) return m[1].trim();
  const alt = text.match(/\b([A-Za-z][A-Za-z' -]{2,40})\s+Apartments\b/i);
  if (alt?.[1]) return alt[1].trim();
  return null;
}

function normalizeNeighborhood(raw: string | null | undefined, fallbackText?: string | null): string | null {
  const primary = raw?.trim() ?? "";
  const backup = fallbackText?.trim() ?? "";
  const combined = `${primary} ${backup}`.trim().toLowerCase();
  if (!combined) return null;

  for (const [canonical, aliases] of Object.entries(MONTREAL_BOROUGH_ALIASES)) {
    if (aliases.some((alias) => combined.includes(alias))) return canonical;
  }

  const stop = new Set(["neighbourhood", "neighborhood", "district", "area", "montreal", "montréal", "qc", "quebec"]);
  const tokens = combined
    .split(/[^a-z0-9àâçéèêëîïôûùüÿñæœ'-]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !stop.has(t));
  if (tokens.length > 0) {
    let best: { borough: string; score: number } | null = null;
    for (const [canonical, aliases] of Object.entries(MONTREAL_BOROUGH_ALIASES)) {
      const aliasBag = aliases.join(" ");
      const score = tokens.reduce((acc, token) => (aliasBag.includes(token) ? acc + 1 : acc), 0);
      if (!best || score > best.score) best = { borough: canonical, score };
    }
    if (best && best.score > 0) return best.borough;
  }

  // Keep boroughs canonical only: never return free-form custom values.
  // If nothing reliable matched, leave empty so UI can highlight missing extraction.
  return null;
}

function normalizePets(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (["no_pets", "not_allowed", "no pets"].includes(value)) return "no_pets";
  if (["cats_only", "cats_allowed", "cats only"].includes(value)) return "cats_only";
  if (["cats_and_dogs", "cats_and_dogs_allowed", "cats + dogs"].includes(value)) return "cats_and_dogs";
  if (["all_pets", "pets_allowed", "pet_friendly_unspecified", "pet friendly", "pets allowed", "pets welcome"].includes(value)) return "all_pets";
  return "all_pets";
}

function normalizeParking(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (["no", "none", "no parking", "without parking", "pas de stationnement"].includes(value)) return "No";
  if (
    ["yes", "parking", "street", "indoor", "garage", "with parking", "stationnement"].includes(value) ||
    value.includes("parking") ||
    value.includes("stationnement")
  ) return "Yes";
  return null;
}

function normalizeAirConditioning(raw: string | null | undefined): string | null {
  if (!raw) return "no";
  const value = raw.trim().toLowerCase();
  if (["yes", "y", "true", "available"].includes(value)) return "yes";
  return "no";
}

const MONTREAL_BOROUGH_ALIASES: Record<string, string[]> = {
  "Ahuntsic-Cartierville": ["ahuntsic-cartierville", "ahuntsic", "cartierville"],
  "Anjou": ["anjou"],
  "Côte-des-Neiges/Notre-Dame-de-Grâce": ["côte-des-neiges", "cote-des-neiges", "notre-dame-de-grâce", "ndg", "cdn/ndg"],
  "Lachine": ["lachine"],
  "LaSalle": ["lasalle", "la salle"],
  "Le Plateau-Mont-Royal": ["plateau-mont-royal", "plateau mont royal", "plateau"],
  "Le Sud-Ouest": ["le sud-ouest", "sud-ouest", "sud ouest", "saint-henri", "st-henri", "pointe-saint-charles", "pointe st-charles", "griffintown"],
  "L'Île-Bizard/Sainte-Geneviève": ["île-bizard", "ile-bizard", "sainte-geneviève", "ste-geneviève"],
  "Mercier-Hochelaga-Maisonneuve": ["mercier-hochelaga-maisonneuve", "hochelaga-maisonneuve", "hochelaga", "hmh"],
  "Montréal-Nord": ["montréal-nord", "montreal-nord", "montreal nord"],
  "Outremont": ["outremont"],
  "Pierrefonds-Roxboro": ["pierrefonds-roxboro", "pierrefonds", "roxboro"],
  "Rivière-des-Prairies/Pointe-aux-Trembles": ["rivière-des-prairies", "riviere-des-prairies", "pointe-aux-trembles", "rdp", "pat"],
  "Rosemont/La Petite-Patrie": ["rosemont", "la petite-patrie", "la petite patrie", "rosemont/la petite-patrie"],
  "Saint-Laurent": ["saint-laurent", "st-laurent", "saint laurent"],
  "Saint-Léonard": ["saint-léonard", "st-léonard", "saint leonard", "st leonard"],
  "Verdun/Île-des-Soeurs": ["verdun", "île-des-soeurs", "ile-des-soeurs", "nun's island", "nuns island"],
  "Ville-Marie": ["ville-marie", "downtown", "centre-ville", "old montreal", "vieux-montréal", "vieux montreal"],
  "Villeray/Saint-Michel/Parc-Extension": ["villeray", "saint-michel", "st-michel", "parc-extension", "parc extension"],
};

function detectParking(text: string): string | null {
  if (/no parking|without parking|pas de stationnement/i.test(text)) return "No";
  if (/parking|stationnement|garage|indoor parking|street parking/i.test(text)) return "Yes";
  return null;
}

function extractMainImage(text: string): string | null {
  const isJunk = (url: string) => {
    if (url.includes("data:image")) return true;
    if (/\.(svg|gif|ico)(\?|$)/i.test(url)) return true;
    if (/favicon|logo|sprite|spacer|1x1|icon[_\-.]/i.test(url)) return true;
    // Tracking / analytics domains
    if (/bat\.bing\.com|google-analytics|googletagmanager|doubleclick|facebook\.com\/tr|scorecardresearch|quantserve|mxpnl|segment\.io|clarity\.ms/i.test(url)) return true;
    // Tracking pixels: lots of query params, no image extension
    if (!(/\.(jpg|jpeg|png|webp)/i.test(url)) && (url.match(/[&=]/g) ?? []).length > 6) return true;
    return false;
  };

  // Jina markdown images: ![alt](url)
  const mdImages = [...text.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g)];

  // First pass: image URL with a photo extension, not junk
  for (const m of mdImages) {
    const url = m[1];
    if (url && /\.(jpg|jpeg|png|webp)/i.test(url) && !isJunk(url)) return url;
  }
  // Second pass: any image URL, not junk
  for (const m of mdImages) {
    const url = m[1];
    if (url && !isJunk(url)) return url;
  }
  // Fallback: bare image URL anywhere in text
  const allBare = [...text.matchAll(/https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)(?:[?#][^\s"'<>]*)?/gi)];
  for (const m of allBare) {
    if (!isJunk(m[0])) return m[0];
  }
  return null;
}

function extractTitle(text: string): string | null {
  const delimited = text.match(/Title:\s*(.*?)\s+URL Source:/i);
  if (delimited?.[1]) return delimited[1].trim();
  const fallback = text.match(/Title:\s*([^|]{5,140})/i);
  return fallback?.[1]?.trim() ?? null;
}

class DefaultRentSchemaExtractor implements RentSchemaExtractor {
  extract(cleanedText: string, html: string, url: string): Partial<NormalizedListing> {
    const warnings: string[] = [];
    const price = extractFirstMoney(cleanedText);
    if (!price) warnings.push("Price could not be confidently extracted.");
    const extractedAddress = extractAddress(cleanedText, url);
    const addressMatch = extractedAddress ? [extractedAddress] : null;
    if (!addressMatch) warnings.push("Address could not be confidently extracted.");
    const generic = parseGenericHtml(html, "about:blank");
    const bedrooms = extractBedrooms(cleanedText);
    const bathrooms = extractBathrooms(cleanedText);
    const squareFeet = extractSquareFeet(cleanedText);
    const floor = extractFloor(cleanedText);
    const neighborhood = extractNeighborhood(cleanedText);

    const populatedCore = [
      price,
      addressMatch?.[0],
      bedrooms,
      bathrooms,
      squareFeet,
      floor,
      detectAvailableFrom(cleanedText),
      detectPets(cleanedText),
      detectFurnished(cleanedText),
    ].filter(Boolean).length;

    return {
      currentPrice: price ?? generic.currentPrice,
      address: normalizeAddress(addressMatch?.[0] ?? generic.address ?? null),
      neighborhood: normalizeNeighborhood(neighborhood ?? generic.neighborhood ?? null, cleanedText),
      bedrooms: bedrooms ?? generic.bedrooms ?? null,
      bathrooms: bathrooms ?? generic.bathrooms ?? null,
      squareFeet: squareFeet ?? generic.squareFeet ?? null,
      floor: floor ?? generic.floor ?? null,
      sourceSite: generic.sourceSite ?? "unknown",
      title: extractTitle(cleanedText) ?? generic.title,
      description: generic.description,
      mainImageUrl: extractMainImage(cleanedText) ?? generic.mainImageUrl,
      furnishedStatus: normalizeFurnished(detectFurnished(cleanedText)),
      leaseTerm: detectLeaseTerm(cleanedText),
      availableFrom: normalizeAvailableFrom(detectAvailableFrom(cleanedText), cleanedText),
      petsAllowedInfo: normalizePets(detectPets(cleanedText)),
      appliancesIncluded: detectAppliances(cleanedText),
      airConditioning: normalizeAirConditioning(detectAirConditioning(cleanedText)),
      parkingInfo: normalizeParking(detectParking(cleanedText)),
      extractionWarnings: warnings.length ? JSON.stringify(warnings) : null,
      extractionConfidence: populatedCore >= 5 ? 85 : populatedCore >= 3 ? 70 : populatedCore >= 1 ? 45 : 20,
    };
  }
}

class DefaultRentNormalizer implements RentNormalizer {
  normalize(partial: Partial<NormalizedListing>, url: string, cleanedText: string): NormalizedListing {
    return {
      ...emptyNormalized(),
      sourceSite: "rent_generic",
      listingStatus: "active",
      currency: "CAD",
      rawData: JSON.stringify({ source: "rent_generic", url, extractedAt: new Date().toISOString() }),
      rawContent: cleanedText,
      ...partial,
    };
  }
}

function pickFirst(...values: Array<string | null | undefined>): string | null {
  for (const v of values) {
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

function extractJsonObject(text: string): string | null {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const obj = text.match(/\{[\s\S]*\}/);
  return obj?.[0]?.trim() ?? null;
}

class OpenAiCompatibleRentExtractor implements RentLlmExtractor {
  async extract(cleanedText: string, url: string, config: LlmRuntimeConfig, missingFields?: string[]): Promise<Partial<NormalizedListing> | null> {
    if (!config.enabled) return null;
    const maxInputChars = Number(process.env["LLM_MAX_INPUT_CHARS"] || DEFAULT_LLM_MAX_INPUT_CHARS);

    // Only ask for fields the heuristic couldn't fill
    const fields = missingFields && missingFields.length > 0 ? missingFields : [
      "currentPrice","address","neighborhood","bedrooms","bathrooms","squareFeet",
      "floor","availableFrom","leaseTerm","furnishedStatus","petsAllowedInfo",
      "appliancesIncluded","airConditioning","parkingInfo",
    ];
    const fieldSchema = fields.map(f => `  "${f}": string|null`).join(",\n");

    const prompt = `Extract ONLY the following fields from the rental listing text. Return ONLY JSON.
Fields needed: ${fields.join(", ")}

{
${fieldSchema}
}

Rules:
- Only return the fields listed above.
- For price: digits only, e.g. "1800".
- For address: street number + street name only, no city/borough suffix.
- For neighborhood: canonical Montreal borough name only (e.g. "Rosemont", "Plateau-Mont-Royal", "Hochelaga-Maisonneuve").
- For unavailable fields: null.
- Text may be English or French. French clues: "stationnement"=parking, "animaux"/"chat"/"chien"=pets, "meublé"=furnished, "climatisé"/"thermopompe"=AC, "disponible le"=available from, "quartier"/"arrondissement"=neighborhood.
URL: ${url}
TEXT:
${cleanedText.slice(0, Number.isFinite(maxInputChars) ? maxInputChars : DEFAULT_LLM_MAX_INPUT_CHARS)}`;

    try {
      const timeoutMs = Number(process.env["LLM_TIMEOUT_MS"] || DEFAULT_LLM_TIMEOUT_MS);
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_LLM_TIMEOUT_MS,
      );
      const resp = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
          ...(config.baseUrl.includes("openrouter.ai")
            ? { "HTTP-Referer": "http://localhost", "X-Title": "Apartment-Watchlist" }
            : {}),
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!resp.ok) return null;
      const data = (await resp.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content ?? "";
      const jsonText = extractJsonObject(content);
      if (!jsonText) return null;
      const parsed = JSON.parse(jsonText) as Record<string, unknown>;
      return {
        title: typeof parsed["title"] === "string" ? parsed["title"] : null,
        currentPrice: typeof parsed["currentPrice"] === "string" ? parsed["currentPrice"] : null,
        address: normalizeAddress(typeof parsed["address"] === "string" ? parsed["address"] : null),
        neighborhood: normalizeNeighborhood(
          typeof parsed["neighborhood"] === "string" ? parsed["neighborhood"] : null,
          cleanedText,
        ),
        bedrooms: typeof parsed["bedrooms"] === "string" ? parsed["bedrooms"] : null,
        bathrooms: typeof parsed["bathrooms"] === "string" ? parsed["bathrooms"] : null,
        squareFeet: typeof parsed["squareFeet"] === "string" ? parsed["squareFeet"] : null,
        floor: typeof parsed["floor"] === "string" ? parsed["floor"] : null,
        availableFrom: normalizeAvailableFrom(
          typeof parsed["availableFrom"] === "string" ? parsed["availableFrom"] : null,
          cleanedText,
        ),
        leaseTerm: typeof parsed["leaseTerm"] === "string" ? parsed["leaseTerm"] : null,
        furnishedStatus: normalizeFurnished(typeof parsed["furnishedStatus"] === "string" ? parsed["furnishedStatus"] : null),
        petsAllowedInfo: normalizePets(typeof parsed["petsAllowedInfo"] === "string" ? parsed["petsAllowedInfo"] : null),
        appliancesIncluded: typeof parsed["appliancesIncluded"] === "string" ? parsed["appliancesIncluded"] : null,
        airConditioning: normalizeAirConditioning(typeof parsed["airConditioning"] === "string" ? parsed["airConditioning"] : null),
        parkingInfo: normalizeParking(typeof parsed["parkingInfo"] === "string" ? parsed["parkingInfo"] : null),
      };
    } catch {
      return null;
    }
  }
}

function resolveLlmRuntimeConfig(settings: Awaited<ReturnType<typeof getSettings>>): LlmRuntimeConfig | null {
  if (process.env["LLM_ENABLED"] === "false" || settings.llmProvider === "disabled") return null;

  if (settings.llmProvider === "ollama") {
    return {
      enabled: true,
      provider: "ollama",
      baseUrl: process.env["OLLAMA_BASE_URL"] || "http://127.0.0.1:11434/v1",
      apiKey: process.env["OLLAMA_API_KEY"] || "ollama",
      model: settings.llmModel || process.env["OLLAMA_MODEL"] || "qwen2.5:7b-instruct",
    };
  }

  const apiKey = process.env["OPENAI_API_KEY"] || process.env["OPENROUTER_API_KEY"] || "";
  if (!apiKey) return null;
  return {
    enabled: true,
    provider: "openai_compatible",
    baseUrl:
      process.env["OPENAI_BASE_URL"] ||
      (process.env["OPENROUTER_API_KEY"] ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1"),
    apiKey,
    model:
      settings.llmModel ||
      process.env["OPENAI_MODEL"] ||
      (process.env["OPENROUTER_API_KEY"] ? "openai/gpt-4o-mini" : "gpt-4o-mini"),
  };
}

async function scrapeRentGeneric(url: string): Promise<ScrapeResult> {
  const fetcher: RentContentFetcher = new DefaultRentContentFetcher();
  const cleaner: RentContentCleaner = new DefaultRentContentCleaner();
  const extractor: RentSchemaExtractor = new DefaultRentSchemaExtractor();
  const normalizer: RentNormalizer = new DefaultRentNormalizer();
  const llmExtractor: RentLlmExtractor = new OpenAiCompatibleRentExtractor();
  try {
    const settings = await getSettings();
    const llmConfig = resolveLlmRuntimeConfig(settings);
    const { html, jinaText } = await fetcher.fetch(url);
    const cleaned = cleaner.toMainText(html);
    if (!cleaned) return { success: false, data: null, errorMessage: "No readable content extracted" };
    const heuristic = extractor.extract(cleaned, html, url);

    // Determine which fields heuristic left null — only ask LLM for those
    const EXTRACTABLE_FIELDS = [
      "currentPrice","address","neighborhood","bedrooms","bathrooms","squareFeet",
      "floor","availableFrom","leaseTerm","furnishedStatus","petsAllowedInfo",
      "appliancesIncluded","airConditioning","parkingInfo",
    ] as const;
    type ExtractableField = typeof EXTRACTABLE_FIELDS[number];
    const missingFields = EXTRACTABLE_FIELDS.filter(
      (f) => heuristic[f as keyof typeof heuristic] == null || heuristic[f as keyof typeof heuristic] === ""
    ) as ExtractableField[];

    const shouldUseLlm = !!llmConfig && missingFields.length > 0;
    const llm = shouldUseLlm && llmConfig
      ? await llmExtractor.extract(cleaned, url, llmConfig, [...missingFields])
      : null;

    const warnings: string[] = [];
    if (llm && llmConfig && missingFields.length > 0) {
      warnings.push(`Extraction engine: heuristic + ${llmConfig.provider} for [${missingFields.join(", ")}]`);
    } else if (!shouldUseLlm) {
      warnings.push("Extraction engine: heuristic (all fields found)");
    } else {
      warnings.push("Extraction engine: heuristic (LLM unavailable or timed out)");
    }

    // Heuristic wins on every field it found. LLM only fills in nulls.
    const fill = <T>(hVal: T | null | undefined, llmVal: T | null | undefined): T | null =>
      (hVal != null && hVal !== "" as unknown) ? hVal : (llmVal ?? null);

    const extracted: Partial<NormalizedListing> = {
      ...heuristic,
      title: heuristic.title ?? llm?.title ?? null,
      currentPrice: fill(heuristic.currentPrice, llm?.currentPrice),
      address: fill(heuristic.address, normalizeAddress(llm?.address)),
      neighborhood: normalizeNeighborhood(
        fill(heuristic.neighborhood, llm?.neighborhood),
        heuristic.address ?? llm?.address ?? cleaned,
      ),
      bedrooms: fill(heuristic.bedrooms, llm?.bedrooms),
      bathrooms: fill(heuristic.bathrooms, llm?.bathrooms),
      squareFeet: fill(heuristic.squareFeet, llm?.squareFeet),
      floor: fill(heuristic.floor, llm?.floor),
      availableFrom: normalizeAvailableFrom(
        fill(heuristic.availableFrom, llm?.availableFrom),
        cleaned,
      ),
      leaseTerm: fill(heuristic.leaseTerm, llm?.leaseTerm),
      furnishedStatus: normalizeFurnished(fill(heuristic.furnishedStatus, llm?.furnishedStatus)),
      petsAllowedInfo: normalizePets(fill(heuristic.petsAllowedInfo, llm?.petsAllowedInfo)),
      appliancesIncluded: fill(heuristic.appliancesIncluded, llm?.appliancesIncluded),
      airConditioning: normalizeAirConditioning(fill(heuristic.airConditioning, llm?.airConditioning)),
      parkingInfo: normalizeParking(fill(heuristic.parkingInfo, llm?.parkingInfo)),
      extractionWarnings: (() => {
        let existing: unknown[] = [];
        if (heuristic.extractionWarnings) {
          try {
            const parsed = JSON.parse(heuristic.extractionWarnings) as unknown;
            existing = Array.isArray(parsed) ? parsed : [];
          } catch {
            existing = [];
          }
        }
        const merged = [...(Array.isArray(existing) ? existing : []), ...warnings];
        return merged.length ? JSON.stringify(merged) : null;
      })(),
    };
    // If image not found from HTML parsing, scan raw Jina markdown for image URLs
    if (!extracted.mainImageUrl && jinaText) {
      extracted.mainImageUrl = extractMainImage(jinaText) ?? extracted.mainImageUrl ?? null;
    }
    const normalized = normalizer.normalize(extracted, url, cleaned);
    return { success: true, data: normalized, errorMessage: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, data: null, errorMessage: message };
  }
}

/**
 * Allowed listing source hostnames. Only Centris and Realtor.ca are supported.
 * This prevents SSRF attacks where a user-supplied URL could reach internal
 * services, private IP ranges, or unintended hosts.
 */
const ALLOWED_HOSTNAME_PATTERNS = [
  /^(www\.)?centris\.(ca|com)$/i,
  /^(www\.)?realtor\.ca$/i,
];

/**
 * Validate that a URL is safe to fetch:
 * - Must be http or https
 * - Hostname must match one of the approved listing sources
 * Returns an error string if invalid, or null if the URL is acceptable.
 */
function isPrivateOrLocalLiteral(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) return true;
  if (host === "::1") return true;
  // IPv4 literals
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    if (host.startsWith("10.")) return true;
    if (host.startsWith("127.")) return true;
    if (host.startsWith("192.168.")) return true;
    if (host.startsWith("169.254.")) return true;
    const second = Number(host.split(".")[1] || "0");
    if (host.startsWith("172.") && second >= 16 && second <= 31) return true;
  }
  return false;
}

export function validateListingUrl(
  urlString: string,
  listingType: "buy" | "rent" = "buy",
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return "Invalid URL format.";
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "Only http and https URLs are allowed.";
  }

  const hostname = parsed.hostname.toLowerCase();
  if (isPrivateOrLocalLiteral(hostname)) {
    return `URL host "${hostname}" is not allowed.`;
  }

  if (listingType === "rent") {
    return null;
  }

  const allowed = ALLOWED_HOSTNAME_PATTERNS.some((re) => re.test(hostname));
  if (!allowed) {
    return `URL host "${hostname}" is not an allowed listing source. Only centris.ca and realtor.ca are supported.`;
  }

  return null;
}

/**
 * Return a mock scrape result for development/testing.
 *
 * Enabled by setting the MOCK_MODE=true environment variable.
 * Simulates a realistic listing with slightly randomised price so the diff
 * engine can detect changes across repeated calls.
 */
function mockScrapeResult(url: string): ScrapeResult {
  const sourceSite = url.includes("centris") ? "centris" : "realtor";
  const basePrice = 450000 + Math.floor(Math.random() * 5) * 1000;

  const data: NormalizedListing = {
    ...emptyNormalized(),
    sourceSite,
    listingStatus: "active",
    currentPrice: String(basePrice),
    currency: "CAD",
    title: "Mock Listing – Dev Mode",
    address: "123 Mock Street",
    neighborhood: "Mock Neighbourhood",
    city: "Montreal",
    province: "QC",
    postalCode: "H0H 0H0",
    bedrooms: "2",
    bathrooms: "1",
    squareFeet: "800",
    propertyType: "Condo",
    daysOnMarket: "14",
    description: "This is a mock listing returned in MOCK_MODE=true.",
    brokerName: "Mock Agent",
    brokerage: "Mock Realty",
    rawData: JSON.stringify({ mock: true, url }),
  };

  logger.info({ url, basePrice }, "MOCK_MODE: returning mock scrape result");
  return { success: true, data, errorMessage: null };
}

/**
 * Resolve the effective extraction mode for a given URL.
 *
 * Precedence: per-source override (centrisExtractionMode / realtorExtractionMode)
 * > global extractionMode > default "native".
 */
async function resolveExtractionMode(url: string): Promise<"native" | "browse_ai"> {
  try {
    const settings = await getSettings();
    const isCentris = url.includes("centris.ca");
    const isRealtor = url.includes("realtor.ca");

    let effectiveMode: string | null = null;

    if (isCentris && settings.centrisExtractionMode) {
      effectiveMode = settings.centrisExtractionMode;
    } else if (isRealtor && settings.realtorExtractionMode) {
      effectiveMode = settings.realtorExtractionMode;
    } else {
      effectiveMode = settings.extractionMode;
    }

    return effectiveMode === "browse_ai" ? "browse_ai" : "native";
  } catch {
    return "native";
  }
}

export async function scrapeUrl(
  url: string,
  listingType: "buy" | "rent" = "buy",
): Promise<ScrapeResult> {
  if (process.env["MOCK_MODE"] === "true") {
    return mockScrapeResult(url);
  }

  const mode = await resolveExtractionMode(url);

  if (mode === "browse_ai") {
    const browseAiSettings = await getBrowseAiSettings();
    if (browseAiSettings.enabled) {
      logger.info({ url }, "Attempting Browse AI extraction");
      try {
        const data = await fetchViaBrowseAi(url, browseAiSettings);
        if (data) {
          return { success: true, data, errorMessage: null };
        }
      } catch (err) {
        logger.warn({ url, err }, "Browse AI extraction failed, falling back to native");
      }
    } else {
      logger.warn({ url }, "Browse AI mode requested but not configured; falling back to native");
    }
  }

  // Rent flow is intentionally source-agnostic for now:
  // use generic extraction and avoid per-site parser dispatch.
  if (listingType === "rent") {
    const genericResult = await scrapeRentGeneric(url);
    if (genericResult.success && (genericResult.data?.extractionConfidence ?? 0) >= 40) {
      return genericResult;
    }

    // Safe fallback for rent: if generic extraction failed, retry Browse AI if configured.
    const browseAiSettings = await getBrowseAiSettings();
    if (browseAiSettings.enabled) {
      try {
        const data = await fetchViaBrowseAi(url, browseAiSettings);
        if (data) return { success: true, data, errorMessage: null };
      } catch (err) {
        logger.warn({ url, err }, "Browse AI fallback failed for rent extraction");
      }
    }
    return genericResult;
  }

  return scrapeNative(url);
}

export async function scrapeNative(
  url: string,
  options?: { forceGeneric?: boolean },
): Promise<ScrapeResult> {
  try {
    logger.info({ url }, "Scraping URL natively");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: DEFAULT_HEADERS,
        signal: controller.signal,
        redirect: "follow",
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      logger.warn({ url, status: response.status }, "HTTP error fetching listing");
      return {
        success: false,
        data: null,
        errorMessage: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    // Detect silent redirects: Centris returns HTTP 200 to a *different* listing
    // when the original is sold/removed. Compare listing IDs embedded in the URLs.
    const originalId = url.match(/\/(\d{6,})/)?.[1];
    const finalId = response.url.match(/\/(\d{6,})/)?.[1];
    if (originalId && finalId && originalId !== finalId) {
      logger.info(
        { url, finalUrl: response.url, originalId, finalId },
        "Listing redirected to a different property — marking as unavailable",
      );
      return {
        success: false,
        data: null,
        errorMessage: `Listing no longer available (redirected to ${finalId})`,
      };
    }

    // Centris search/results pages have no listing ID in the URL — also unavailable
    if (originalId && !finalId) {
      logger.info({ url, finalUrl: response.url }, "Listing URL resolved to non-listing page — marking as unavailable");
      return {
        success: false,
        data: null,
        errorMessage: "Listing no longer available (URL resolved to non-listing page)",
      };
    }

    const html = await response.text();
    if (!html || html.length < 100) {
      return {
        success: false,
        data: null,
        errorMessage: "Empty or too-short response body",
      };
    }

    const data = options?.forceGeneric ? parseGenericHtml(html, url) : parseHtml(html, url);
    logger.info({ url, sourceSite: data.sourceSite }, "Scraping complete");

    return { success: true, data, errorMessage: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ url, err }, "Error scraping URL");
    return {
      success: false,
      data: null,
      errorMessage: message,
    };
  }
}
