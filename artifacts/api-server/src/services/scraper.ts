import { logger } from "../lib/logger.js";
import { parseHtml, type NormalizedListing } from "../parsers/index.js";
import { emptyNormalized } from "../parsers/shared.js";
import { getBrowseAiSettings, fetchViaBrowseAi } from "./browseAI.js";
import { getSettings } from "./settingsService.js";

const FETCH_TIMEOUT_MS = 15000;

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
export function validateListingUrl(urlString: string): string | null {
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

export async function scrapeUrl(url: string): Promise<ScrapeResult> {
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

  return scrapeNative(url);
}

export async function scrapeNative(url: string): Promise<ScrapeResult> {
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

    const html = await response.text();
    if (!html || html.length < 100) {
      return {
        success: false,
        data: null,
        errorMessage: "Empty or too-short response body",
      };
    }

    const data = parseHtml(html, url);
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
