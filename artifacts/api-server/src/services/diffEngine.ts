import { normalizePrice } from "../parsers/shared.js";
import type { InsertListingChange } from "@workspace/db";

export type ChangeType =
  | "price_drop"
  | "price_increase"
  | "status_change"
  | "removed"
  | "restored";

export interface DetectedChange {
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  changeType: ChangeType;
}

// Only track the two things the user cares about: price and availability.
const TRACKED_FIELDS: Array<{
  field: string;
  normalize?: (v: string | null) => string | null;
  changeTypeFn: (old: string | null, current: string | null) => ChangeType;
}> = [
  {
    field: "currentPrice",
    normalize: normalizePrice,
    changeTypeFn: (old, curr) => {
      const o = parseFloat(old || "0");
      const c = parseFloat(curr || "0");
      if (isNaN(o) || isNaN(c)) return "price_increase";
      return c < o ? "price_drop" : "price_increase";
    },
  },
  {
    field: "listingStatus",
    changeTypeFn: (old, curr) => {
      if (curr === "removed" || curr === "unavailable") return "removed";
      if (old === "removed" || old === "unavailable") return "restored";
      return "status_change";
    },
  },
];

export function diffListings(
  previous: Record<string, unknown>,
  current: Record<string, unknown>,
): DetectedChange[] {
  const changes: DetectedChange[] = [];

  for (const spec of TRACKED_FIELDS) {
    const rawOld = (previous[spec.field] ?? null) as string | null;
    const rawCurr = (current[spec.field] ?? null) as string | null;

    const oldVal = spec.normalize ? spec.normalize(rawOld) : rawOld;
    const currVal = spec.normalize ? spec.normalize(rawCurr) : rawCurr;

    // Treat null/empty as same
    const normalOld = oldVal || null;
    const normalCurr = currVal || null;

    if (normalOld !== normalCurr) {
      const changeType = spec.changeTypeFn
        ? spec.changeTypeFn(normalOld, normalCurr)
        : "metadata_change";

      changes.push({
        fieldName: spec.field,
        oldValue: normalOld,
        newValue: normalCurr,
        changeType,
      });
    }
  }

  return changes;
}

export function changesToInserts(
  listingId: number,
  changes: DetectedChange[],
): InsertListingChange[] {
  return changes.map((c) => ({
    listingId,
    fieldName: c.fieldName,
    oldValue: c.oldValue,
    newValue: c.newValue,
    changeType: c.changeType,
  }));
}
