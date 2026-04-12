import * as cheerio from "cheerio";
import { isCentris, parseCentris } from "./centris.js";
import { isRealtor, parseRealtor } from "./realtor.js";
import { emptyNormalized, normalizeWhitespace, extractJsonLd, type NormalizedListing } from "./shared.js";

export { type NormalizedListing } from "./shared.js";

export function detectSource(url: string): string {
  if (isCentris(url)) return "centris";
  if (isRealtor(url)) return "realtor";
  return "unknown";
}

function parseGeneric(html: string, url: string): NormalizedListing {
  const result = emptyNormalized();
  result.sourceSite = "unknown";

  try {
    const $ = cheerio.load(html);

    // Try JSON-LD
    const jsonLdBlocks = extractJsonLd(html);
    for (const block of jsonLdBlocks) {
      if (block.name) result.title = result.title || String(block.name);
      if (block.description) result.description = result.description || normalizeWhitespace(String(block.description));
    }

    if (!result.title) {
      result.title = $("h1").first().text().trim() || $("title").text().trim() || null;
    }

    const ogImage = $('meta[property="og:image"]').attr("content");
    if (ogImage) result.mainImageUrl = ogImage;

    result.listingStatus = "active";
    result.rawData = JSON.stringify({ source: "generic", url, extractedAt: new Date().toISOString() });
  } catch (err) {
    result.rawData = JSON.stringify({ error: String(err), source: "generic", url });
  }

  return result;
}

export function parseHtml(html: string, url: string): NormalizedListing {
  if (isCentris(url)) return parseCentris(html, url);
  if (isRealtor(url)) return parseRealtor(html, url);
  return parseGeneric(html, url);
}

export { isCentris, parseCentris, isRealtor, parseRealtor };
