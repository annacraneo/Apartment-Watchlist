import { logger } from "../lib/logger.js";

interface MetroStation {
  name: string;
  lat: number;
  lng: number;
  line: string;
}

const MONTREAL_METRO_STATIONS: MetroStation[] = [
  // Green Line (1) — West to East
  { name: "Angrignon", lat: 45.4459, lng: -73.6038, line: "Green" },
  { name: "Monk", lat: 45.4524, lng: -73.5939, line: "Green" },
  { name: "Jolicoeur", lat: 45.4575, lng: -73.5826, line: "Green" },
  { name: "Verdun", lat: 45.4604, lng: -73.5723, line: "Green" },
  { name: "De l'Église", lat: 45.4602, lng: -73.5638, line: "Green" },
  { name: "LaSalle", lat: 45.4570, lng: -73.5488, line: "Green" },
  { name: "Charlevoix", lat: 45.4545, lng: -73.5388, line: "Green" },
  { name: "Lionel-Groulx", lat: 45.4735, lng: -73.5762, line: "Green/Orange" },
  { name: "Atwater", lat: 45.4737, lng: -73.5768, line: "Green" },
  { name: "Guy-Concordia", lat: 45.4950, lng: -73.5798, line: "Green" },
  { name: "Peel", lat: 45.4994, lng: -73.5706, line: "Green" },
  { name: "McGill", lat: 45.5059, lng: -73.5686, line: "Green" },
  { name: "Place-des-Arts", lat: 45.5087, lng: -73.5637, line: "Green" },
  { name: "Saint-Laurent", lat: 45.5110, lng: -73.5605, line: "Green" },
  { name: "Berri-UQAM", lat: 45.5156, lng: -73.5494, line: "Green/Orange/Yellow" },
  { name: "Beaudry", lat: 45.5208, lng: -73.5513, line: "Green" },
  { name: "Papineau", lat: 45.5234, lng: -73.5467, line: "Green" },
  { name: "Frontenac", lat: 45.5310, lng: -73.5455, line: "Green" },
  { name: "Préfontaine", lat: 45.5358, lng: -73.5449, line: "Green" },
  { name: "Joliette", lat: 45.5462, lng: -73.5412, line: "Green" },
  { name: "Pie-IX", lat: 45.5508, lng: -73.5332, line: "Green" },
  { name: "Viau", lat: 45.5588, lng: -73.5298, line: "Green" },
  { name: "Assomption", lat: 45.5627, lng: -73.5238, line: "Green" },
  { name: "Cadillac", lat: 45.5651, lng: -73.5148, line: "Green" },
  { name: "Langelier", lat: 45.5664, lng: -73.5022, line: "Green" },
  { name: "Radisson", lat: 45.5650, lng: -73.4989, line: "Green" },
  { name: "Honoré-Beaugrand", lat: 45.5626, lng: -73.4836, line: "Green" },

  // Orange Line (2) — Côte-Vertu branch
  { name: "Côte-Vertu", lat: 45.5142, lng: -73.7317, line: "Orange" },
  { name: "Du Collège", lat: 45.5113, lng: -73.7245, line: "Orange" },
  { name: "De la Savane", lat: 45.5054, lng: -73.7074, line: "Orange" },
  { name: "Namur", lat: 45.5050, lng: -73.6808, line: "Orange" },
  { name: "Plamondon", lat: 45.4983, lng: -73.6683, line: "Orange" },
  { name: "Côte-Sainte-Catherine", lat: 45.4955, lng: -73.6609, line: "Orange" },
  { name: "Snowdon", lat: 45.4949, lng: -73.6554, line: "Orange/Blue" },
  { name: "Villa-Maria", lat: 45.4800, lng: -73.6436, line: "Orange" },
  { name: "Vendôme", lat: 45.4731, lng: -73.6141, line: "Orange" },
  { name: "Place-Saint-Henri", lat: 45.4713, lng: -73.5880, line: "Orange" },
  { name: "Georges-Vanier", lat: 45.4778, lng: -73.5685, line: "Orange" },
  { name: "Lucien-L'Allier", lat: 45.4815, lng: -73.5676, line: "Orange" },
  { name: "Bonaventure", lat: 45.4987, lng: -73.5653, line: "Orange" },
  { name: "Square-Victoria–OACI", lat: 45.5022, lng: -73.5625, line: "Orange" },
  { name: "Place-d'Armes", lat: 45.5090, lng: -73.5589, line: "Orange" },
  { name: "Champ-de-Mars", lat: 45.5124, lng: -73.5555, line: "Orange" },

  // Orange Line (2) — Montmorency branch (north of Berri-UQAM)
  { name: "Sherbrooke", lat: 45.5225, lng: -73.5551, line: "Orange" },
  { name: "Mont-Royal", lat: 45.5284, lng: -73.5831, line: "Orange" },
  { name: "Laurier", lat: 45.5291, lng: -73.5907, line: "Orange" },
  { name: "Rosemont", lat: 45.5316, lng: -73.5963, line: "Orange" },
  { name: "Beaubien", lat: 45.5406, lng: -73.5943, line: "Orange" },
  { name: "Jean-Talon", lat: 45.5448, lng: -73.5987, line: "Orange/Blue" },
  { name: "Crémazie", lat: 45.5554, lng: -73.6089, line: "Orange" },
  { name: "Sauvé", lat: 45.5592, lng: -73.6192, line: "Orange" },
  { name: "Henri-Bourassa", lat: 45.5638, lng: -73.6401, line: "Orange" },
  { name: "Cartier", lat: 45.5769, lng: -73.6908, line: "Orange" },
  { name: "Concorde", lat: 45.5819, lng: -73.7060, line: "Orange" },
  { name: "Montmorency", lat: 45.5877, lng: -73.7194, line: "Orange" },

  // Yellow Line (4)
  { name: "Longueuil–Université-de-Sherbrooke", lat: 45.5254, lng: -73.5161, line: "Yellow" },

  // Blue Line (5)
  { name: "Côte-des-Neiges", lat: 45.4936, lng: -73.6448, line: "Blue" },
  { name: "Université-de-Montréal", lat: 45.5019, lng: -73.6175, line: "Blue" },
  { name: "Édouard-Montpetit", lat: 45.5067, lng: -73.6139, line: "Blue" },
  { name: "Outremont", lat: 45.5109, lng: -73.6054, line: "Blue" },
  { name: "Acadie", lat: 45.5216, lng: -73.6091, line: "Blue" },
  { name: "Parc", lat: 45.5268, lng: -73.6024, line: "Blue" },
  { name: "De Castelnau", lat: 45.5318, lng: -73.6010, line: "Blue" },
  { name: "Fabre", lat: 45.5478, lng: -73.5889, line: "Blue" },
  { name: "D'Iberville", lat: 45.5512, lng: -73.5693, line: "Blue" },
  { name: "Saint-Michel", lat: 45.5559, lng: -73.5651, line: "Blue" },
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

/** Haversine-only fallback — used when OSRM is unavailable */
function findNearestMetroFallback(lat: number, lng: number): NearestMetroResult {
  let nearest = MONTREAL_METRO_STATIONS[0];
  let minDist = Infinity;
  for (const station of MONTREAL_METRO_STATIONS) {
    const dist = haversineKm(lat, lng, station.lat, station.lng);
    if (dist < minDist) { minDist = dist; nearest = station; }
  }
  // Conservative 1.6× route factor; 4.5 km/h pedestrian pace
  const walkingMinutes = Math.round((minDist * 1.6) / 4.5 * 60);
  return { name: nearest.name, walkingMinutes: Math.max(1, walkingMinutes), distanceKm: Math.round(minDist * 100) / 100 };
}

/**
 * Uses OSRM (OpenStreetMap routing) to find the nearest station by actual
 * walking distance. Pre-filters to the 10 closest stations by straight-line
 * distance, then does one batch routing query for all 10.
 */
async function findNearestMetroViaOSRM(lat: number, lng: number): Promise<NearestMetroResult | null> {
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
    `?sources=0&destinations=${destinations}&annotations=distance`;

  const resp = await fetch(url, {
    headers: { "User-Agent": "AptWatch/1.0 (apartment-watchlist)" },
    signal: AbortSignal.timeout(12000),
  });
  if (!resp.ok) return null;

  const data = (await resp.json()) as {
    code?: string;
    distances?: (number | null)[][];
  };
  if (data.code !== "Ok" || !data.distances?.[0]) return null;

  // 3. Pick the station with the shortest road-network walking distance
  let bestIdx = 0;
  let bestMeters = Infinity;
  data.distances[0].forEach((dist, i) => {
    if (dist !== null && dist < bestMeters) { bestMeters = dist; bestIdx = i; }
  });

  const best = candidates[bestIdx];
  // The public OSRM server's foot-profile speed is inaccurate; compute time ourselves
  // using 4.5 km/h average walking pace (conservative for urban blocks)
  const walkingMeters = bestMeters < Infinity ? bestMeters : best.straightKm * 1000;
  const walkingMinutes = Math.max(1, Math.round((walkingMeters / 1000 / 4.5) * 60));

  return {
    name: best.name,
    walkingMinutes,
    distanceKm: Math.round(walkingMeters / 10) / 100,
  };
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const query = encodeURIComponent(`${address}, Montréal, QC, Canada`);
    const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=ca`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "AptWatch/1.0 (apartment-watchlist)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const results = (await resp.json()) as Array<{ lat: string; lon: string }>;
    if (!results.length) return null;
    return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
  } catch (err) {
    logger.warn({ address, err }, "Nominatim geocoding failed");
    return null;
  }
}

export async function computeMetroProximity(
  lat: string | null | undefined,
  lng: string | null | undefined,
  address: string | null | undefined,
): Promise<NearestMetroResult | null> {
  let coords: { lat: number; lng: number } | null = null;

  if (lat && lng) {
    const latN = parseFloat(lat);
    const lngN = parseFloat(lng);
    if (!isNaN(latN) && !isNaN(lngN)) coords = { lat: latN, lng: lngN };
  }

  if (!coords && address) {
    coords = await geocodeAddress(address);
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
