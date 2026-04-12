import * as cheerio from "cheerio";
import { emptyNormalized, extractJsonLd, normalizeWhitespace, type NormalizedListing } from "./shared.js";

export function isRealtor(url: string): boolean {
  return /realtor\.ca/i.test(url);
}

export function parseRealtor(html: string, url: string): NormalizedListing {
  const result = emptyNormalized();
  result.sourceSite = "realtor";

  try {
    const $ = cheerio.load(html);

    // Extract MLS ID from URL or page
    const mlsMatch = url.match(/\/(\w+)\/?$/) || html.match(/MLS[®#\s]*:?\s*([A-Z0-9]+)/i);
    if (mlsMatch) result.externalListingId = mlsMatch[1];

    // JSON-LD extraction
    const jsonLdBlocks = extractJsonLd(html);
    for (const block of jsonLdBlocks) {
      const type = block["@type"];
      if (type === "SingleFamilyResidence" || type === "Apartment" || type === "House" || type === "RealEstateListing" || type === "Product") {
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
          if (addr.addressCountry) {
            // Build neighborhood from locality if available
          }
        }
        if (block.geo && typeof block.geo === "object") {
          const geo = block.geo as Record<string, unknown>;
          if (geo.latitude) result.latitude = String(geo.latitude);
          if (geo.longitude) result.longitude = String(geo.longitude);
        }
        if (block.numberOfRooms) result.bedrooms = String(block.numberOfRooms);
        if (block.numberOfBathroomsTotal) result.bathrooms = String(block.numberOfBathroomsTotal);
        if (block.floorSize && typeof block.floorSize === "object") {
          const fs = block.floorSize as Record<string, unknown>;
          if (fs.value) result.squareFeet = String(fs.value);
        }
      }
    }

    // Price fallback from page
    if (!result.currentPrice) {
      const priceEl = $('[class*="price"], [class*="Price"], [data-automation*="price"]').first();
      if (priceEl.length) {
        const raw = priceEl.text().replace(/\s+/g, " ").trim();
        const match = raw.match(/[\d,]+/);
        if (match) result.currentPrice = match[0].replace(/,/g, "");
      }
    }
    if (!result.currency) result.currency = "CAD";

    // Title fallback
    if (!result.title) {
      result.title = $("h1").first().text().trim() || $("title").text().trim() || null;
    }

    // Address fallback
    if (!result.address) {
      const addrEl = $("[class*='address'], [class*='Address'], [itemprop='address']").first();
      if (addrEl.length) {
        result.address = addrEl.text().replace(/\s+/g, " ").trim();
      }
    }

    // Beds/baths from page
    if (!result.bedrooms) {
      const bedsEl = $("[class*='bed'], [class*='Bed'], [aria-label*='bed']").first();
      if (bedsEl.length) {
        const m = bedsEl.text().match(/(\d+)/);
        if (m) result.bedrooms = m[1];
      }
    }
    if (!result.bathrooms) {
      const bathEl = $("[class*='bath'], [class*='Bath'], [aria-label*='bath']").first();
      if (bathEl.length) {
        const m = bathEl.text().match(/(\d+(?:\.\d+)?)/);
        if (m) result.bathrooms = m[1];
      }
    }

    // Sqft
    if (!result.squareFeet) {
      const sqftMatch = html.match(/(\d[\d,]*)\s*(?:sq\.?\s*ft|sqft|square\s*feet)/i);
      if (sqftMatch) result.squareFeet = sqftMatch[1].replace(/,/g, "");
    }

    // Property type
    if (!result.propertyType) {
      const typeEl = $("[class*='property-type'], [class*='PropertyType'], [data-automation*='propertyType']").first();
      if (typeEl.length) result.propertyType = typeEl.text().trim();
    }

    // Status
    const bodyText = $("body").text().toLowerCase();
    if (/sold|vendu/i.test(bodyText)) result.listingStatus = "sold";
    else if (/conditional|pending|promesse/i.test(bodyText)) result.listingStatus = "pending";
    else if (/expired|terminated|removed/i.test(bodyText)) result.listingStatus = "removed";
    else result.listingStatus = "active";

    // Description fallback
    if (!result.description) {
      const descEl = $("[class*='description'], [class*='Description'], [id*='description']").first();
      if (descEl.length) result.description = normalizeWhitespace(descEl.text());
    }

    // Broker/Agent
    const agentEl = $("[class*='agent'], [class*='Agent'], [class*='broker'], [class*='Broker']").first();
    if (agentEl.length) result.brokerName = agentEl.text().trim().substring(0, 100);

    // Images
    const imgs: string[] = [];
    $("img").each((_, el) => {
      const src = $(el).attr("src") || $(el).attr("data-src");
      if (src && /\.(jpg|jpeg|png|webp)/i.test(src) && !src.includes("icon") && !src.includes("logo")) {
        const full = src.startsWith("http") ? src : `https://www.realtor.ca${src}`;
        imgs.push(full);
      }
    });

    // Also try og:image
    const ogImage = $('meta[property="og:image"]').attr("content");
    if (ogImage && !imgs.includes(ogImage)) imgs.unshift(ogImage);

    if (imgs.length > 0) {
      result.mainImageUrl = imgs[0];
      result.allImageUrls = JSON.stringify(imgs.slice(0, 20));
    }

    // Year built
    const yearMatch = html.match(/(?:built|year built|année de construction)[:\s]*(\d{4})/i);
    if (yearMatch) result.yearBuilt = yearMatch[1];

    // Condo fees
    const condoMatch = html.match(/(?:condo fee|maintenance fee|frais de condo)[:\s]*\$?([\d,]+)/i);
    if (condoMatch) result.condoFees = condoMatch[1].replace(/,/g, "");

    // Taxes
    const taxMatch = html.match(/(?:annual tax|property tax|taxes)[:\s]*\$?([\d,]+)/i);
    if (taxMatch) result.taxes = taxMatch[1].replace(/,/g, "");

    // Days on market
    const daysMatch = html.match(/(\d+)\s*days?\s*on\s*market/i);
    if (daysMatch) result.daysOnMarket = daysMatch[1];

    result.rawData = JSON.stringify({ source: "realtor", url, extractedAt: new Date().toISOString() });
  } catch (err) {
    result.rawData = JSON.stringify({ error: String(err), source: "realtor", url });
  }

  return result;
}
