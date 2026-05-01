export interface NormalizedListing {
  sourceSite: string | null;
  externalListingId: string | null;
  title: string | null;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  latitude: string | null;
  longitude: string | null;
  currentPrice: string | null;
  currency: string | null;
  bedrooms: string | null;
  bathrooms: string | null;
  squareFeet: string | null;
  propertyType: string | null;
  floor: string | null;
  yearBuilt: string | null;
  condoFees: string | null;
  taxes: string | null;
  furnishedStatus: string | null;
  leaseTerm: string | null;
  availableFrom: string | null;
  petsAllowedInfo: string | null;
  appliancesIncluded: string | null;
  airConditioning: string | null;
  extractionConfidence: number | null;
  extractionWarnings: string | null;
  rawContent: string | null;
  nearestMetro: string | null;
  walkingMinutes: number | null;
  parkingInfo: string | null;
  listingStatus: string | null;
  daysOnMarket: string | null;
  description: string | null;
  brokerName: string | null;
  brokerage: string | null;
  mainImageUrl: string | null;
  allImageUrls: string | null;
  rawData: string | null;
}

export function emptyNormalized(): NormalizedListing {
  return {
    sourceSite: null,
    externalListingId: null,
    title: null,
    address: null,
    neighborhood: null,
    city: null,
    province: null,
    postalCode: null,
    latitude: null,
    longitude: null,
    currentPrice: null,
    currency: null,
    bedrooms: null,
    bathrooms: null,
    squareFeet: null,
    propertyType: null,
    floor: null,
    yearBuilt: null,
    condoFees: null,
    taxes: null,
    furnishedStatus: null,
    leaseTerm: null,
    availableFrom: null,
    petsAllowedInfo: null,
    appliancesIncluded: null,
    airConditioning: null,
    extractionConfidence: null,
    extractionWarnings: null,
    rawContent: null,
    nearestMetro: null,
    walkingMinutes: null,
    parkingInfo: null,
    listingStatus: null,
    daysOnMarket: null,
    description: null,
    brokerName: null,
    brokerage: null,
    mainImageUrl: null,
    allImageUrls: null,
    rawData: null,
  };
}

/** Words that appear after numeric listing IDs in URL slugs — not street names. */
const NON_STREET_START =
  /^(?:apartment|appartement|unit|suite|listing|rent(?:al)?|location|for|available|disponible|condo|loft|studio|duplex|triplex|plex|property|home|house)\b/i;

/** Needs a real street cue (Montreal-centric EN/FR). Avoids Kijiji-style "1736717117 Apartment For Rent" slugs. */
const STREET_TYPE_HINT =
  /\b(?:rue|avenue|ave\.?|boulevard|blvd\.?|street|\bst\b|st\.|road|rd\.?|drive|dr\.?|lane|ln\.?|chemin|place|pl\.?|crescent|cres\.?|court|ct\.?|impasse|route|way|terrace|terr\.?|square|walk|trail|parkway|circle|cir\.?|saint|sainte)\b/i;

/**
 * True only for a plausible civic street line (number + street name with type).
 * Rejects city/postal-only, bare listing IDs, Kijiji slug junk, and "1736719117 → 17367 + 19917 …" splits.
 */
export function looksLikeStreetAddress(address: string): boolean {
  const line = (address.trim().split(",")[0] ?? "").trim();
  if (!line) return false;
  // Bare listing ID / postal-ish digit blobs
  if (/^\d{5,}$/.test(line)) return false;
  // Need: civic number (1–5 digits; never 6+ digit fake "house numbers"), space, rest of line
  const m = line.match(/^(\d{1,5}(?:-\d{1,5})?[A-Za-z]?)\s+(.+)$/);
  if (!m) return false;
  const civicMain = (m[1].replace(/[A-Za-z]$/, "").split("-")[0] ?? "").trim();
  if (!/^\d+$/.test(civicMain)) return false;
  if (civicMain.length > 5) return false;
  const n = parseInt(civicMain, 10);
  if (!Number.isFinite(n) || n < 1 || n > 99999) return false;

  const rest = m[2].trim();
  if (!/[A-Za-zÀ-ÿ]/.test(rest)) return false;
  // Second cluster of digits = often a Kijiji ad id left in the slug/text
  if (/^\d{5,}\b/.test(rest)) return false;
  if (NON_STREET_START.test(rest)) return false;
  if (!STREET_TYPE_HINT.test(rest)) return false;
  return true;
}

export function normalizePrice(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  return num.toFixed(2);
}

export function normalizeWhitespace(text: string | null | undefined): string | null {
  if (!text) return null;
  return text.replace(/\s+/g, " ").trim();
}

export function extractJsonLd(html: string): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed)) {
        results.push(...parsed);
      } else {
        results.push(parsed);
      }
    } catch {
      // ignore malformed JSON-LD
    }
  }
  return results;
}

export function detectDuplicateByUrl(url: string, existingUrls: string[]): boolean {
  const normalizedUrl = url.trim().toLowerCase().replace(/\/$/, "");
  return existingUrls.some((u) => u.trim().toLowerCase().replace(/\/$/, "") === normalizedUrl);
}

export function computePriceDelta(current: string | null, previous: string | null): string | null {
  if (!current || !previous) return null;
  const curr = parseFloat(current);
  const prev = parseFloat(previous);
  if (isNaN(curr) || isNaN(prev) || prev === 0) return null;
  const delta = curr - prev;
  return delta.toFixed(2);
}
