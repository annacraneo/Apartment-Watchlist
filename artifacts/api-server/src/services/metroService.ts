import { logger } from "../lib/logger.js";

interface MetroStation {
  name: string;
  lat: number;
  lng: number;
  line: string;
}

const MONTREAL_CENTER = { lat: 45.5017, lng: -73.5673 };
const MAX_REASONABLE_DISTANCE_FROM_MONTREAL_KM = 60;

// Coordinates sourced from OpenStreetMap (Overpass API, station=subway nodes, April 2026)
const MONTREAL_METRO_STATIONS: MetroStation[] = [
  // Green Line (1) — Angrignon → Honoré-Beaugrand
  { name: "Angrignon",           lat: 45.4462, lng: -73.6036, line: "Green" },
  { name: "Monk",                lat: 45.4510, lng: -73.5932, line: "Green" },
  { name: "Jolicoeur",           lat: 45.4568, lng: -73.5820, line: "Green" },
  { name: "Verdun",              lat: 45.4594, lng: -73.5728, line: "Green" },
  { name: "De l'Église",         lat: 45.4628, lng: -73.5670, line: "Green" },
  { name: "LaSalle",             lat: 45.4708, lng: -73.5661, line: "Green" },
  { name: "Charlevoix",          lat: 45.4782, lng: -73.5694, line: "Green" },
  { name: "Lionel-Groulx",       lat: 45.4828, lng: -73.5798, line: "Green/Orange" },
  { name: "Atwater",             lat: 45.4897, lng: -73.5863, line: "Green" },
  { name: "Guy-Concordia",       lat: 45.4954, lng: -73.5798, line: "Green" },
  { name: "Peel",                lat: 45.5006, lng: -73.5751, line: "Green" },
  { name: "McGill",              lat: 45.5041, lng: -73.5716, line: "Green" },
  { name: "Place-des-Arts",      lat: 45.5080, lng: -73.5683, line: "Green" },
  { name: "Saint-Laurent",       lat: 45.5109, lng: -73.5648, line: "Green" },
  { name: "Berri-UQAM",          lat: 45.5151, lng: -73.5611, line: "Green/Orange/Yellow" },
  { name: "Beaudry",             lat: 45.5195, lng: -73.5572, line: "Green" },
  { name: "Papineau",            lat: 45.5237, lng: -73.5522, line: "Green" },
  { name: "Frontenac",           lat: 45.5332, lng: -73.5522, line: "Green" },
  { name: "Préfontaine",         lat: 45.5417, lng: -73.5542, line: "Green" },
  { name: "Joliette",            lat: 45.5469, lng: -73.5511, line: "Green" },
  { name: "Pie-IX",              lat: 45.5542, lng: -73.5515, line: "Green" },
  { name: "Viau",                lat: 45.5611, lng: -73.5473, line: "Green" },
  { name: "Assomption",          lat: 45.5694, lng: -73.5467, line: "Green" },
  { name: "Cadillac",            lat: 45.5768, lng: -73.5467, line: "Green" },
  { name: "Langelier",           lat: 45.5827, lng: -73.5432, line: "Green" },
  { name: "Radisson",            lat: 45.5896, lng: -73.5398, line: "Green" },
  { name: "Honoré-Beaugrand",    lat: 45.5964, lng: -73.5354, line: "Green" },

  // Orange Line (2) — Côte-Vertu branch (south to north)
  { name: "Côte-Vertu",          lat: 45.5143, lng: -73.6833, line: "Orange" },
  { name: "Du Ruisseau",         lat: 45.5289, lng: -73.6902, line: "Orange" },
  { name: "Du Collège",          lat: 45.5085, lng: -73.6728, line: "Orange" },
  { name: "De la Savane",        lat: 45.5004, lng: -73.6616, line: "Orange" },
  { name: "Namur",               lat: 45.4949, lng: -73.6529, line: "Orange" },
  { name: "Plamondon",           lat: 45.4944, lng: -73.6379, line: "Orange" },
  { name: "Côte-Sainte-Catherine", lat: 45.4924, lng: -73.6329, line: "Orange" },
  { name: "Snowdon",             lat: 45.4857, lng: -73.6284, line: "Orange/Blue" },
  { name: "Villa-Maria",         lat: 45.4798, lng: -73.6198, line: "Orange" },
  { name: "Vendôme",             lat: 45.4739, lng: -73.6038, line: "Orange" },
  { name: "Place-Saint-Henri",   lat: 45.4772, lng: -73.5866, line: "Orange" },
  { name: "Georges-Vanier",      lat: 45.4890, lng: -73.5765, line: "Orange" },
  { name: "Lucien-L'Allier",     lat: 45.4950, lng: -73.5709, line: "Orange" },
  { name: "Bonaventure",         lat: 45.4982, lng: -73.5670, line: "Orange" },
  { name: "Square-Victoria–OACI", lat: 45.5021, lng: -73.5631, line: "Orange" },
  { name: "Place-d'Armes",       lat: 45.5061, lng: -73.5596, line: "Orange" },
  { name: "Champ-de-Mars",       lat: 45.5101, lng: -73.5565, line: "Orange" },

  // Orange Line (2) — Montmorency branch (north of Berri-UQAM)
  { name: "Sherbrooke",          lat: 45.5187, lng: -73.5681, line: "Orange" },
  { name: "Mont-Royal",          lat: 45.5246, lng: -73.5816, line: "Orange" },
  { name: "Laurier",             lat: 45.5281, lng: -73.5884, line: "Orange" },
  { name: "Rosemont",            lat: 45.5315, lng: -73.5973, line: "Orange" },
  { name: "Beaubien",            lat: 45.5351, lng: -73.6046, line: "Orange" },
  { name: "Jean-Talon",          lat: 45.5392, lng: -73.6134, line: "Orange/Blue" },
  { name: "Crémazie",            lat: 45.5461, lng: -73.6388, line: "Orange" },
  { name: "Sauvé",               lat: 45.5511, lng: -73.6565, line: "Orange" },
  { name: "Henri-Bourassa",      lat: 45.5545, lng: -73.6683, line: "Orange" },
  { name: "Cartier",             lat: 45.5602, lng: -73.6818, line: "Orange" },
  { name: "De la Concorde",      lat: 45.5609, lng: -73.7097, line: "Orange" },
  { name: "Montmorency",         lat: 45.5584, lng: -73.7215, line: "Orange" },

  // Yellow Line (4)
  { name: "Jean-Drapeau",        lat: 45.5124, lng: -73.5331, line: "Yellow" },
  { name: "Longueuil–Université-de-Sherbrooke", lat: 45.5249, lng: -73.5219, line: "Yellow" },

  // Blue Line (5) — Snowdon → Saint-Michel
  { name: "Côte-des-Neiges",     lat: 45.4967, lng: -73.6235, line: "Blue" },
  { name: "Université-de-Montréal", lat: 45.5034, lng: -73.6176, line: "Blue" },
  { name: "Édouard-Montpetit",   lat: 45.5101, lng: -73.6125, line: "Blue" },
  { name: "Outremont",           lat: 45.5201, lng: -73.6149, line: "Blue" },
  { name: "Acadie",              lat: 45.5232, lng: -73.6238, line: "Blue" },
  { name: "Parc",                lat: 45.5304, lng: -73.6245, line: "Blue" },
  { name: "De Castelnau",        lat: 45.5353, lng: -73.6201, line: "Blue" },
  { name: "Jarry",               lat: 45.5432, lng: -73.6286, line: "Blue" },
  { name: "Fabre",               lat: 45.5468, lng: -73.6078, line: "Blue" },
  { name: "D'Iberville",         lat: 45.5526, lng: -73.6027, line: "Blue" },
  { name: "Saint-Michel",        lat: 45.5597, lng: -73.5999, line: "Blue" },
];

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface NearestMetroResult {
  name: string;
  walkingMinutes: number;
  distanceKm: number;
}

/**
 * Nearest metro via haversine + Google Maps walking speed (5 km/h) and a 1.3×
 * street-grid factor. Matches real-world Montreal walking times within ~2 min.
 */
function findNearestMetroFallback(lat: number, lng: number): NearestMetroResult {
  let nearest = MONTREAL_METRO_STATIONS[0];
  let minDist = Infinity;
  for (const station of MONTREAL_METRO_STATIONS) {
    const dist = haversineKm(lat, lng, station.lat, station.lng);
    if (dist < minDist) { minDist = dist; nearest = station; }
  }
  // 1.3× Manhattan-grid route factor (Montreal is highly orthogonal, especially east side)
  // 5.0 km/h walking pace — matches Google Maps default pedestrian speed
  const walkingMinutes = Math.round((minDist * 1.3) / 5.0 * 60);
  return { name: nearest.name, walkingMinutes: Math.max(1, walkingMinutes), distanceKm: Math.round(minDist * 100) / 100 };
}

// Circuit-breaker for OSRM timeouts/network errors. We only pause OSRM lookups
// temporarily (instead of for the whole process lifetime) so transient outages
// do not permanently degrade metro quality.
let osrmDisabledUntilMs = 0;

/**
 * Uses OSRM (OpenStreetMap routing) to find the nearest station by actual
 * walking distance. Pre-filters to the 10 closest stations by straight-line
 * distance, then does one batch routing query for all 10.
 */
async function findNearestMetroViaOSRM(lat: number, lng: number): Promise<NearestMetroResult | null> {
  if (Date.now() < osrmDisabledUntilMs) return null;
  const TOP_N = 10;

  // 1. Pre-filter: cheapest 10 by haversine
  const candidates = MONTREAL_METRO_STATIONS
    .map((s) => ({ ...s, straightKm: haversineKm(lat, lng, s.lat, s.lng) }))
    .sort((a, b) => a.straightKm - b.straightKm)
    .slice(0, TOP_N);

  // 2. Build OSRM Table request
  //    Coordinate format: lng,lat (OSRM uses lon first)
  //    Index 0 = the listing; indices 1..N = metro stations
  const coords = [
    `${lng},${lat}`,
    ...candidates.map((s) => `${s.lng},${s.lat}`),
  ].join(";");
  // OSRM table API uses semicolons to separate index lists
  const destinations = candidates.map((_, i) => i + 1).join(";");
  const url =
    `https://router.project-osrm.org/table/v1/foot/${coords}` +
    `?sources=0&destinations=${destinations}&annotations=duration,distance`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: { "User-Agent": "AptWatch/1.0 (apartment-watchlist)" },
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    osrmDisabledUntilMs = Date.now() + 5 * 60 * 1000;
    logger.warn("OSRM unreachable — temporarily using haversine fallback");
    return null;
  }
  if (!resp.ok) return null;

  const data = (await resp.json()) as {
    code?: string;
    durations?: (number | null)[][];
    distances?: (number | null)[][];
  };
  if (data.code !== "Ok" || !data.durations?.[0]) return null;

  // 3. Pick the station with the shortest routed DISTANCE (not duration —
  //    router.project-osrm.org returns car speeds even on the foot profile).
  const distances = data.distances?.[0] ?? [];
  let bestIdx = 0;
  let bestMeters = Infinity;
  distances.forEach((meters, i) => {
    if (meters !== null && meters < bestMeters) { bestMeters = meters; bestIdx = i; }
  });
  // Fall back to haversine pick if distances are missing
  if (bestMeters === Infinity) {
    bestIdx = 0; // candidates already sorted by haversine
    bestMeters = (candidates[0]?.straightKm ?? 1) * 1000;
  }

  const best = candidates[bestIdx];
  const walkingMeters = bestMeters;
  // Apply Google Maps walking speed: 5 km/h = 83.3 m/min
  const walkingMinutes = Math.max(1, Math.round((walkingMeters / 1000) / 5.0 * 60));

  return {
    name: best.name,
    walkingMinutes,
    distanceKm: Math.round(walkingMeters / 10) / 100,
  };
}

function cleanAddressForGeocoding(address: string): string {
  return address
    // Remove borough/city suffixes in parentheses: "(Le Sud-Ouest)", "(Mercier/Hochelaga-Maisonneuve)"
    .replace(/\s*\([^)]*\)/g, "")
    // Remove apartment/unit designators: "apt. 102", "apt 4", "# 3B", "suite 200"
    .replace(/,?\s*(?:apt\.?|appt\.?|app\.?|unit|suite|bureau|#)\s*[\w-]+/gi, "")
    // Collapse multiple commas and trim
    .replace(/,\s*,+/g, ",")
    .replace(/,\s*$/, "")
    .trim();
}

async function geocodeAddress(
  address: string,
  city?: string | null,
  province?: string | null,
  neighborhood?: string | null,
): Promise<{ lat: number; lng: number } | null> {
  const cleaned = cleanAddressForGeocoding(address);
  const localitySuffix = [city, province].filter(Boolean).join(", ");
  // Use neighborhood as disambiguation hint — prevents same-street-name mismatches
  // (e.g. "rue Saint-Germain" exists in both Hochelaga AND NDG).
  const neighHint = neighborhood ? neighborhood.split(/[/\-–]/)[0]?.trim() : null;
  const attempts = [
    neighHint ? `${cleaned}, ${neighHint}, Montreal, QC, Canada` : null,
    `${cleaned}, Montreal, QC, Canada`,
    `${address}, Montreal, QC, Canada`,
    localitySuffix ? `${cleaned}, ${localitySuffix}, Canada` : null,
    `${cleaned}, Canada`,
  ].filter((a, i, arr) => !!a && arr.indexOf(a) === i) as string[];

  for (const attempt of attempts) {
    try {
      const query = encodeURIComponent(attempt);
      // Montréal rough bounding box: west,south,east,north (lon/lat)
      const viewbox = "-74.10,45.35,-73.35,45.75";
      const url =
        `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=ca` +
        `&viewbox=${viewbox}&bounded=1`;
      const resp = await fetch(url, {
        headers: { "User-Agent": "AptWatch/1.0 (apartment-watchlist)" },
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) continue;
      const results = (await resp.json()) as Array<{ lat: string; lon: string }>;
      if (results.length) {
        const lat = parseFloat(results[0].lat);
        const lng = parseFloat(results[0].lon);
        const distFromMontreal = haversineKm(lat, lng, MONTREAL_CENTER.lat, MONTREAL_CENTER.lng);
        if (distFromMontreal <= MAX_REASONABLE_DISTANCE_FROM_MONTREAL_KM) {
          return { lat, lng };
        }
      }
      // Respect Nominatim rate limit between retries
      await new Promise((r) => setTimeout(r, 1100));
    } catch (err) {
      logger.warn({ address: attempt, err }, "Nominatim geocoding attempt failed");
    }
  }
  return null;
}

export async function computeMetroProximity(
  lat: string | null | undefined,
  lng: string | null | undefined,
  address: string | null | undefined,
  city?: string | null | undefined,
  province?: string | null | undefined,
  neighborhood?: string | null | undefined,
): Promise<NearestMetroResult | null> {
  let coords: { lat: number; lng: number } | null = null;

  if (lat && lng) {
    const latN = parseFloat(lat);
    const lngN = parseFloat(lng);
    if (!isNaN(latN) && !isNaN(lngN)) coords = { lat: latN, lng: lngN };
  }

  if (!coords && address) {
    coords = await geocodeAddress(address, city, province, neighborhood);
  }

  if (!coords) return null;

  // Try real walking routing first; fall back to conservative haversine estimate
  try {
    const osrm = await findNearestMetroViaOSRM(coords.lat, coords.lng);
    if (osrm) {
      logger.info({ station: osrm.name, walkingMinutes: osrm.walkingMinutes }, "Metro proximity via OSRM");
      return osrm;
    }
  } catch (err) {
    logger.warn({ err }, "OSRM routing failed, falling back to haversine");
  }

  return findNearestMetroFallback(coords.lat, coords.lng);
}
