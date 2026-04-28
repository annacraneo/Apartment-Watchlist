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

export function parseGenericHtml(html: string, url: string): NormalizedListing {
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

    // Try various image meta tags in priority order
    const imageCandidate =
      $('meta[property="og:image:secure_url"]').attr("content") ||
      $('meta[property="og:image"]').attr("content") ||
      $('meta[property="og:image:url"]').attr("content") ||
      $('meta[name="twitter:image"]').attr("content") ||
      $('meta[name="twitter:image:src"]').attr("content") ||
      $('link[rel="image_src"]').attr("href") ||
      null;

    if (imageCandidate) {
      result.mainImageUrl = imageCandidate;
    } else {
      // JSON-LD image field
      for (const block of jsonLdBlocks) {
        const img = block.image;
        if (typeof img === "string" && img.startsWith("http")) {
          result.mainImageUrl = img;
          break;
        } else if (Array.isArray(img) && typeof img[0] === "string" && img[0].startsWith("http")) {
          result.mainImageUrl = img[0];
          break;
        } else if (img && typeof img === "object" && "url" in img && typeof (img as { url: unknown }).url === "string") {
          result.mainImageUrl = (img as { url: string }).url;
          break;
        }
      }
    }

    // Fallback: scan <img> tags — prefer gallery/photo containers, skip only obvious junk
    if (!result.mainImageUrl) {
      const isObviousJunk = (src: string) => {
        if (src.includes("data:image")) return true;
        if (/\.(svg|gif|ico)(\?|$)/i.test(src)) return true;
        if (/favicon|logo|sprite|spacer|1x1|icon[_\-.]/i.test(src)) return true;
        if (/bat\.bing\.com|google-analytics|googletagmanager|doubleclick|facebook\.com\/tr|scorecardresearch/i.test(src)) return true;
        if (!(/\.(jpg|jpeg|png|webp)/i.test(src)) && (src.match(/[&=]/g) ?? []).length > 6) return true;
        return false;
      };

      const getImgSrc = (el: ReturnType<typeof $>[0]) =>
        $(el).attr("src") ||
        $(el).attr("data-src") ||
        $(el).attr("data-lazy-src") ||
        $(el).attr("data-original") ||
        $(el).attr("data-lazy") ||
        $(el).attr("data-image") ||
        null;

      const pickImg = (selector: string): string | null => {
        let found: string | null = null;
        $(selector).each((_i, el) => {
          if (found) return false;
          const src = getImgSrc(el);
          if (src && src.startsWith("http") && !isObviousJunk(src)) {
            found = src;
          }
        });
        return found;
      };

      // 1. Try gallery/photo containers first
      const gallerySelectors = [
        "[class*='gallery'] img", "[class*='photo'] img",
        "[class*='carousel'] img", "[class*='slider'] img",
        "[class*='listing-image'] img", "[class*='property-image'] img",
        "[class*='main-image'] img", "[class*='hero'] img",
        "[id*='gallery'] img", "[id*='photo'] img",
      ];
      for (const sel of gallerySelectors) {
        const found = pickImg(sel);
        if (found) { result.mainImageUrl = found; break; }
      }

      // 2. Any img on the page
      if (!result.mainImageUrl) result.mainImageUrl = pickImg("img");
    }

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
  return parseGenericHtml(html, url);
}

export { isCentris, parseCentris, isRealtor, parseRealtor };
