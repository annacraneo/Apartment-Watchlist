import React from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export const SOURCE_SITE_LABELS: Record<string, string> = {
  facebook: "Facebook",
  duproprio: "DuProprio",
  kijiji: "Kijiji",
  rentals_ca: "Rentals.ca",
  craigslist: "Craigslist",
  louer_ca: "Louer.ca",
  zumper: "Zumper",
  padmapper: "PadMapper",
  apartments_com: "Apartments.com",
  rent_generic: "Other",
  unknown: "Other",
};

export function formatSourceSite(value: string | null | undefined): string {
  if (!value) return "—";
  return SOURCE_SITE_LABELS[value] ?? value.replace(/_/g, ".").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function RentFilters({
  minRent,
  maxRent,
  onMinRentChange,
  onMaxRentChange,
  rentBounds,
  petsAllowed,
  onPetsAllowedChange,
  availableBy,
  onAvailableByChange,
  availableOptions,
  sourceSite,
  onSourceSiteChange,
  sourceOptions,
}: {
  minRent: number | null;
  maxRent: number | null;
  onMinRentChange: (value: number | null) => void;
  onMaxRentChange: (value: number | null) => void;
  rentBounds: { min: number; max: number };
  petsAllowed: string;
  onPetsAllowedChange: (value: string) => void;
  availableBy: string;
  onAvailableByChange: (value: string) => void;
  availableOptions: string[];
  sourceSite: string;
  onSourceSiteChange: (value: string) => void;
  sourceOptions: string[];
}) {
  const step = 50;
  const [priceOpen, setPriceOpen] = React.useState(false);
  const [draftMin, setDraftMin] = React.useState(rentBounds.min);
  const [draftMax, setDraftMax] = React.useState(rentBounds.max);

  // When popover opens, seed drafts from current values (or bounds if unset)
  React.useEffect(() => {
    if (priceOpen) {
      setDraftMin(minRent ?? rentBounds.min);
      setDraftMax(maxRent ?? rentBounds.max);
    }
  }, [priceOpen, minRent, maxRent, rentBounds.min, rentBounds.max]);

  const isSet = minRent !== null || maxRent !== null;
  const label = isSet
    ? `Price: $${(minRent ?? rentBounds.min).toLocaleString("en-CA")} – $${(maxRent ?? rentBounds.max).toLocaleString("en-CA")}`
    : "Price";

  return (
    <>
      <Popover open={priceOpen} onOpenChange={setPriceOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-7 text-xs px-3 bg-background">
            {label}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-3" align="start">
          <p className="text-xs font-medium mb-2">Price range</p>
          <div className="relative h-6">
            <input
              type="range"
              min={rentBounds.min}
              max={rentBounds.max}
              step={step}
              value={draftMin}
              onChange={(e) => setDraftMin(Math.min(Number(e.target.value), draftMax))}
              className="absolute inset-0 w-full pointer-events-auto"
            />
            <input
              type="range"
              min={rentBounds.min}
              max={rentBounds.max}
              step={step}
              value={draftMax}
              onChange={(e) => setDraftMax(Math.max(Number(e.target.value), draftMin))}
              className="absolute inset-0 w-full pointer-events-auto"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <Input value={`$${draftMin.toLocaleString("en-CA")}`} readOnly className="h-7 text-xs" />
            <Input value={`$${draftMax.toLocaleString("en-CA")}`} readOnly className="h-7 text-xs" />
          </div>
          <div className="flex justify-between mt-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => {
                onMinRentChange(null);
                onMaxRentChange(null);
                setPriceOpen(false);
              }}
            >
              Clear
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                onMinRentChange(draftMin);
                onMaxRentChange(draftMax);
                setPriceOpen(false);
              }}
            >
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <Select value={petsAllowed} onValueChange={onPetsAllowedChange}>
        <SelectTrigger className="w-[120px] h-7 text-xs bg-background">
          <SelectValue placeholder="Pets" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Pets: Any</SelectItem>
          <SelectItem value="all_pets">All pets</SelectItem>
          <SelectItem value="cats_only">Cats only</SelectItem>
          <SelectItem value="cats_and_dogs">Cats + dogs</SelectItem>
          <SelectItem value="no_pets">No pets</SelectItem>
        </SelectContent>
      </Select>
      <Select value={availableBy || "all"} onValueChange={(v) => onAvailableByChange(v === "all" ? "" : v)}>
        <SelectTrigger className="w-[190px] h-7 text-xs bg-background">
          <SelectValue placeholder="Available from" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Available: Any</SelectItem>
          {availableOptions.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {sourceOptions.length > 1 && (
        <Select value={sourceSite} onValueChange={onSourceSiteChange}>
          <SelectTrigger className="w-[140px] h-7 text-xs bg-background">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Source: Any</SelectItem>
            {sourceOptions.map((s) => (
              <SelectItem key={s} value={s}>
                {formatSourceSite(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </>
  );
}
