import * as cheerio from "cheerio";
import { emptyNormalized, normalizeWhitespace, type NormalizedListing } from "./shared.js";

export function isCentris(url: string): boolean {
  return /centris\.(ca|com)/i.test(url);
}

export function parseCentris(html: string, url: string): NormalizedListing {
  const result = emptyNormalized();
  result.sourceSite = "centris";
  result.currency = "CAD";

  try {
    const $ = cheerio.load(html);

    // ── 1. External listing ID from URL ──────────────────────────────────────
    const idMatch = url.match(/\/(\d{6,})/);
    if (idMatch) result.externalListingId = idMatch[1];

    // ── 2. Price ─────────────────────────────────────────────────────────────
    // Centris puts price in: <span itemprop="price" content="499000">
    const priceItemprop = $("[itemprop='price']").attr("content");
    if (priceItemprop) {
      result.currentPrice = priceItemprop.replace(/[^\d.]/g, "");
    }
    if (!result.currentPrice) {
      // Fallback: <div class="price-container"> or .price
      const priceText = $(".price-container, .price").first().text();
      const priceMatch = priceText.match(/([\d\s,]+)/);
      if (priceMatch) result.currentPrice = priceMatch[1].replace(/[\s,]/g, "");
    }

    // ── 3. Address / city ─────────────────────────────────────────────────────
    // JSON-LD or meta tags
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html() || "");
        const item = Array.isArray(data) ? data[0] : data;
        if (item?.address) {
          const a = item.address;
          if (a.streetAddress && !result.address) {
            // Normalize whitespace; if multiple lines, take last non-empty line (the actual street)
            const lines = String(a.streetAddress).split(/\n/).map(l => l.trim()).filter(Boolean);
            result.address = lines[lines.length - 1] || null;
          }
          if (a.addressLocality && !result.city) result.city = String(a.addressLocality);
          if (a.addressRegion && !result.province) result.province = String(a.addressRegion);
          if (a.postalCode && !result.postalCode) result.postalCode = String(a.postalCode);
        }
        if (item?.name && !result.title) result.title = String(item.name);
        if (item?.description && !result.description) result.description = normalizeWhitespace(String(item.description));
        if (item?.geo) {
          if (item.geo.latitude) result.latitude = String(item.geo.latitude);
          if (item.geo.longitude) result.longitude = String(item.geo.longitude);
        }
      } catch {}
    });

    // Fallback: h1 or address-like element
    if (!result.address) {
      const h1 = $("h1").first().text().trim();
      if (h1) result.title = h1;
      const addrEl = $("[class*='address'], [class*='Address']").first();
      if (addrEl.length) result.address = addrEl.text().trim();
    }
    // Neighbourhood from breadcrumb or neighbourhood div
    const neighbourhood = $("[class*='neighborhood'], [class*='neighbourhood'], [class*='quartier']").first().text().trim();
    if (neighbourhood) result.neighborhood = neighbourhood;

    // Normalize address — take the last meaningful line (strips "Condo for sale" prefix noise)
    if (result.address) {
      const addrLines = result.address.split(/\n|\r/).map(l => l.trim()).filter(Boolean);
      // The street address is always the last populated line
      result.address = addrLines[addrLines.length - 1] || result.address.trim();
    }

    // ── 4. Build a carac (feature) dictionary ────────────────────────────────
    // Centris property detail rows use .carac-title + .carac-value pairs
    const carac: Record<string, string> = {};
    $(".carac-container").each((_, container) => {
      const title = $(container).find(".carac-title").text().replace(/\s+/g, " ").trim().toLowerCase();
      const value = $(container).find(".carac-value").text().replace(/\s+/g, " ").trim();
      if (title && value) carac[title] = value;
    });

    // ── 5. Property type / condo type ────────────────────────────────────────
    // "condominium type" → "Divided" or "Undivided"
    const condoType =
      carac["condominium type"] ||
      carac["type de copropriété"] ||
      carac["property type"] ||
      carac["type de propriété"] ||
      null;
    if (condoType) result.propertyType = condoType;

    // ── 6. Area / sqft ───────────────────────────────────────────────────────
    const areaVal =
      carac["net area"] ||
      carac["superficie nette"] ||
      carac["living area"] ||
      carac["superficie habitable"] ||
      carac["floor area"] ||
      null;
    if (areaVal) {
      const areaMatch = areaVal.match(/([\d,\s]+)/);
      if (areaMatch) result.squareFeet = areaMatch[1].replace(/[,\s]/g, "");
    }
    if (!result.squareFeet) {
      // Fallback: scan the full HTML for "NNN sqft"
      const sqftMatch = html.match(/([\d,\s]+)\s*(sq\.?\s*ft|sqft|pi²|pieds\s*carr[eé]s)/i);
      if (sqftMatch) result.squareFeet = sqftMatch[1].replace(/[,\s]/g, "");
    }

    // ── 7. Year built ────────────────────────────────────────────────────────
    const yearVal =
      carac["year built"] ||
      carac["année de construction"] ||
      carac["built in"] ||
      null;
    if (yearVal) {
      const yMatch = yearVal.match(/\d{4}/);
      if (yMatch) result.yearBuilt = yMatch[0];
    }

    // ── 8. Parking ───────────────────────────────────────────────────────────
    const parkingVal =
      carac["parking (total)"] ||
      carac["parking"] ||
      carac["stationnement (total)"] ||
      carac["stationnement"] ||
      carac["garage"] ||
      null;
    if (parkingVal) result.parkingInfo = parkingVal;

    // ── 9. Floor ─────────────────────────────────────────────────────────────
    const floorVal =
      carac["floor"] ||
      carac["étage"] ||
      carac["level"] ||
      null;
    if (floorVal) result.floor = floorVal;

    // ── 10. Bedrooms & Bathrooms ─────────────────────────────────────────────
    // Centris embeds them in a data block before the carac section, e.g.:
    // "6 rooms  2 bedrooms  1 bathroom"
    // They also appear in the property summary bar.

    // Strategy A: look for "N bedrooms/chambres" in the full page text
    // but only in specific sections, not the whole body (to avoid false matches).
    // The summary block has text like: "6 rooms\n2 bedrooms\n1 bathroom"
    const summaryBlock = $(".property-summary-item, .templateSummaryItem, [class*='house-info'], [class*='d-none d-sm-block']").text();
    const bedsInSummary = summaryBlock.match(/(\d+)\s*(?:bedrooms?|chambres?\s*à\s*coucher)/i);
    const bathsInSummary = summaryBlock.match(/(\d+(?:\.\d+)?)\s*(?:bathrooms?|salles?\s*de\s*bain)/i);
    if (bedsInSummary) result.bedrooms = bedsInSummary[1];
    if (bathsInSummary) result.bathrooms = bathsInSummary[1];

    // Strategy B: the raw HTML data block before carac-container often contains
    // "2 bedrooms" "1 bathroom" as plain text — scan that region
    if (!result.bedrooms || !result.bathrooms) {
      const caracIdx = html.indexOf("carac-container");
      const searchRegion = caracIdx > 0 ? html.slice(Math.max(0, caracIdx - 3000), caracIdx) : html;
      const plainText = searchRegion.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      if (!result.bedrooms) {
        const m = plainText.match(/(\d+)\s*(?:bedrooms?|chambres?\s*à\s*coucher)/i);
        if (m) result.bedrooms = m[1];
      }
      if (!result.bathrooms) {
        const m = plainText.match(/(\d+(?:\.\d+)?)\s*(?:bathrooms?|salles?\s*de\s*bain)/i);
        if (m) result.bathrooms = m[1];
      }
    }

    // Strategy C: scan carac pairs for bedrooms/bathrooms too
    if (!result.bedrooms) {
      const bedsCarac = carac["bedrooms"] || carac["chambres"] || carac["chambres à coucher"];
      if (bedsCarac) result.bedrooms = bedsCarac.match(/\d+/)?.[0] || null;
    }
    if (!result.bathrooms) {
      const bathsCarac = carac["bathrooms"] || carac["salles de bain"] || carac["salle de bain"];
      if (bathsCarac) result.bathrooms = bathsCarac.match(/\d+(?:\.\d+)?/)?.[0] || null;
    }

    // ── 11. Days on market ───────────────────────────────────────────────────
    const moveIn = carac["move-in date"] || carac["date de disponibilité"] || null;
    // "20 days after acceptance of promise to purchase"
    if (moveIn) {
      const domMatch = moveIn.match(/(\d+)\s*(?:days?|jours?)/i);
      if (domMatch) result.daysOnMarket = domMatch[1];
    }
    if (!result.daysOnMarket) {
      const daysRaw = html.match(/(\d+)\s*(?:days?|jours?)\s*(?:on\s*market|sur\s*le\s*march[eé])/i);
      if (daysRaw) result.daysOnMarket = daysRaw[1];
    }

    // ── 12. Financial table — condo fees & taxes ─────────────────────────────
    // Centris financial table structure (two columns: monthly / yearly):
    //   <tr><td>Condominium fees</td><td>$208</td><td>$2,496</td></tr>
    //   <tr><td>Municipal (2026)</td><td>$206</td><td>$2,473</td></tr>
    //
    // IMPORTANT: "Municipal assessment (2026)" rows contain the *assessed value*
    // (e.g. $137,100) — NOT the tax. We must skip those.
    // Only real dollar amounts preceded by "$" are valid (not year numbers like 2026).
    const extractDollarAmounts = (cells: string[]): string[] =>
      cells.flatMap(c => {
        const m = c.match(/\$([\d,]+)/g);
        return m ? m.map(s => s.replace(/[$,]/g, "")) : [];
      });

    // Centris renders the financial table with monthly AND yearly values as separate
    // rows (controlled by a monthly/yearly toggle). We collect all matching rows and
    // pick the largest dollar amount, which is always the annual value.
    const condoFeeAmounts: number[] = [];
    const municipalTaxAmounts: number[] = [];

    $("tr").each((_, row) => {
      const cells = $(row).find("td, th").map((_, td) => $(td).text().replace(/\s+/g, " ").trim()).toArray();
      const rowText = cells.join(" ");

      if (/condominium\s*fees?|frais\s*de\s*copropri/i.test(rowText)) {
        extractDollarAmounts(cells).forEach(a => condoFeeAmounts.push(Number(a.replace(/,/g, ""))));
      }

      // "Municipal (YYYY)" but NOT "Municipal assessment" (which is the assessed value)
      if (/municipal\s*\(\d{4}\)/i.test(rowText) && !/assessment|évaluation/i.test(rowText)) {
        extractDollarAmounts(cells).forEach(a => municipalTaxAmounts.push(Number(a.replace(/,/g, ""))));
      }
    });

    if (condoFeeAmounts.length > 0) {
      // Smallest value = monthly, largest = yearly; display monthly
      const monthly = Math.min(...condoFeeAmounts);
      result.condoFees = `$${monthly.toLocaleString()}/mo`;
    }
    if (municipalTaxAmounts.length > 0) {
      // Largest value = yearly
      const yearly = Math.max(...municipalTaxAmounts);
      result.taxes = `$${yearly.toLocaleString()}/yr`;
    }

    // Fallback regex for condo fees / taxes
    if (!result.condoFees) {
      const condoMatch = html.match(/(?:condominium\s*fees?|frais\s*de\s*copropri[eé]t[eé])[^$]*\$([\d,]+)/i);
      if (condoMatch) result.condoFees = `$${condoMatch[1]}`;
    }
    if (!result.taxes) {
      const taxMatch = html.match(/Municipal\s*\(\d{4}\)[^$]*\$([\d,]+)[^$]*\$([\d,]+)/i);
      if (taxMatch) result.taxes = `$${taxMatch[2]}/yr`;
    }

    // ── 13. Listing status ───────────────────────────────────────────────────
    // Use URL path as primary signal — "for-sale", "sold", "for-rent"
    const urlLower = url.toLowerCase();
    if (/~sold~|\/sold\//i.test(urlLower)) {
      result.listingStatus = "sold";
    } else if (/~for-sale~|\/for-sale\//i.test(urlLower)) {
      // Double-check: look for a prominent SOLD/VENDU overlay (not just in description)
      // The sold banner in Centris is a full-screen overlay, typically in an element
      // with class "sold-banner" or data attribute
      const hasSoldBanner = $("[class*='sold-banner'], [class*='vendu']").length > 0
        || /class="[^"]*\bsold\b[^"]*"/.test(html);
      if (hasSoldBanner) result.listingStatus = "sold";
      else result.listingStatus = "active";
    } else if (/~for-rent~|\/for-rent\//i.test(urlLower)) {
      result.listingStatus = "active";
    } else {
      // Unknown URL shape — use conservative detection
      result.listingStatus = "active";
    }

    // ── 14. Broker / brokerage ───────────────────────────────────────────────
    const brokerEl = $(".broker-info__broker-title, [class*='broker-title'], [class*='agent-name']").first();
    if (brokerEl.length) result.brokerName = brokerEl.text().trim();
    const agencyEl = $(".broker-info__agency-name, [class*='agency-name']").first();
    if (agencyEl.length) result.brokerage = agencyEl.text().trim();

    // ── 15. Description ──────────────────────────────────────────────────────
    if (!result.description) {
      const descEl = $("[class*='description'], [class*='Description'], [id*='description']").first();
      if (descEl.length) result.description = normalizeWhitespace(descEl.text());
    }

    // ── 16. Images ───────────────────────────────────────────────────────────
    const imgs: string[] = [];
    $("img[src], img[data-src]").each((_, el) => {
      const src = $(el).attr("src") || $(el).attr("data-src") || "";
      if (src && /\.(jpg|jpeg|png|webp)/i.test(src) && !/icon|logo|avatar|sprite/i.test(src)) {
        const full = src.startsWith("http") ? src : `https://www.centris.ca${src}`;
        if (!imgs.includes(full)) imgs.push(full);
      }
    });
    if (imgs.length > 0) {
      result.mainImageUrl = imgs[0];
      result.allImageUrls = JSON.stringify(imgs.slice(0, 20));
    }

    // ── 17. Raw data ─────────────────────────────────────────────────────────
    result.rawData = JSON.stringify({
      source: "centris",
      url,
      extractedAt: new Date().toISOString(),
      caracPairs: carac,
    });
  } catch (err) {
    result.rawData = JSON.stringify({ error: String(err), source: "centris", url });
  }

  return result;
}
