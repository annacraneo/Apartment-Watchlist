import * as cheerio from "cheerio";
import { emptyNormalized, extractJsonLd, normalizeWhitespace, type NormalizedListing } from "./shared.js";

export function isCentris(url: string): boolean {
  return /centris\.(ca|com)/i.test(url);
}

export function parseCentris(html: string, url: string): NormalizedListing {
  const result = emptyNormalized();
  result.sourceSite = "centris";

  try {
    const $ = cheerio.load(html);

    // Extract listing ID from URL
    const idMatch = url.match(/\/(\d+)(?:\?|$|\/)/);
    if (idMatch) {
      result.externalListingId = idMatch[1];
    }

    // Try JSON-LD first
    const jsonLdBlocks = extractJsonLd(html);
    for (const block of jsonLdBlocks) {
      if (block["@type"] === "Apartment" || block["@type"] === "House" || block["@type"] === "RealEstateListing") {
        if (block.name) result.title = String(block.name);
        if (block.description) result.description = normalizeWhitespace(String(block.description));
        if (block.offers && typeof block.offers === "object") {
          const offers = block.offers as Record<string, unknown>;
          if (offers.price) result.currentPrice = String(offers.price);
          if (offers.priceCurrency) result.currency = String(offers.priceCurrency);
        }
        if (block.address && typeof block.address === "object") {
          const addr = block.address as Record<string, unknown>;
          if (addr.streetAddress) result.address = String(addr.streetAddress);
          if (addr.addressLocality) result.city = String(addr.addressLocality);
          if (addr.addressRegion) result.province = String(addr.addressRegion);
          if (addr.postalCode) result.postalCode = String(addr.postalCode);
        }
        if (block.geo && typeof block.geo === "object") {
          const geo = block.geo as Record<string, unknown>;
          if (geo.latitude) result.latitude = String(geo.latitude);
          if (geo.longitude) result.longitude = String(geo.longitude);
        }
      }
    }

    // Price extraction
    if (!result.currentPrice) {
      const priceEl = $('[class*="price"], [class*="Price"], [id*="price"]').first();
      if (priceEl.length) {
        const raw = priceEl.text().replace(/\s+/g, " ").trim();
        const match = raw.match(/[\d\s,]+/);
        if (match) result.currentPrice = match[0].replace(/[\s,]/g, "");
      }
    }
    if (!result.currency) result.currency = "CAD";

    // Title/address fallback
    if (!result.title) {
      result.title = $("h1").first().text().trim() || null;
    }
    if (!result.address) {
      const addrEl = $("[class*='address'], [class*='Address']").first();
      result.address = addrEl.text().trim() || null;
    }

    // Property features
    const featuresText = $("[class*='feature'], [class*='Feature'], [class*='caracteristic']").text();
    const bedsMatch = featuresText.match(/(\d+)\s*(bed|chambre|bdr|room)/i);
    const bathsMatch = featuresText.match(/(\d+(?:\.\d+)?)\s*(bath|salle)/i);
    if (bedsMatch && !result.bedrooms) result.bedrooms = bedsMatch[1];
    if (bathsMatch && !result.bathrooms) result.bathrooms = bathsMatch[1];

    // Sqft/area
    const areaMatch = html.match(/(\d[\d,\s]*)\s*(sq\.?\s*ft|pi²|pieds carrés)/i);
    if (areaMatch && !result.squareFeet) {
      result.squareFeet = areaMatch[1].replace(/[,\s]/g, "");
    }

    // Property type
    const typeEl = $("[class*='prop-type'], [class*='property-type'], [class*='category']").first();
    if (typeEl.length) result.propertyType = typeEl.text().trim();

    // Status detection
    const bodyText = $("body").text().toLowerCase();
    if (/vendu|sold/i.test(bodyText)) result.listingStatus = "sold";
    else if (/promesse|pending/i.test(bodyText)) result.listingStatus = "pending";
    else if (/retiré|withdrawn|removed/i.test(bodyText)) result.listingStatus = "removed";
    else result.listingStatus = "active";

    // Description fallback
    if (!result.description) {
      const descEl = $("[class*='description'], [class*='Description'], [id*='description']").first();
      if (descEl.length) result.description = normalizeWhitespace(descEl.text());
    }

    // Broker
    const brokerEl = $("[class*='broker'], [class*='agent'], [class*='courtier']").first();
    if (brokerEl.length) result.brokerName = brokerEl.text().trim();

    const brokerageEl = $("[class*='agency'], [class*='agence']").first();
    if (brokerageEl.length) result.brokerage = brokerageEl.text().trim();

    // Images
    const imgs: string[] = [];
    $("img").each((_, el) => {
      const src = $(el).attr("src") || $(el).attr("data-src");
      if (src && /\.(jpg|jpeg|png|webp)/i.test(src) && !src.includes("icon") && !src.includes("logo")) {
        const full = src.startsWith("http") ? src : `https://www.centris.ca${src}`;
        imgs.push(full);
      }
    });
    if (imgs.length > 0) {
      result.mainImageUrl = imgs[0];
      result.allImageUrls = JSON.stringify(imgs.slice(0, 20));
    }

    // Condo fees
    const condoMatch = html.match(/(\$[\d,\s]+|[\d,\s]+\$)\s*\/?\s*(mois|month|monthly)/i);
    if (condoMatch) result.condoFees = condoMatch[1].trim();

    // Days on market
    const daysMatch = html.match(/(\d+)\s*(days|jours)\s*(on market|sur le marché)?/i);
    if (daysMatch) result.daysOnMarket = daysMatch[1];

    result.rawData = JSON.stringify({ source: "centris", url, extractedAt: new Date().toISOString() });
  } catch (err) {
    result.rawData = JSON.stringify({ error: String(err), source: "centris", url });
  }

  return result;
}
