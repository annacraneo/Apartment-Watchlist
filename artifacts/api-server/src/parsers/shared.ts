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
