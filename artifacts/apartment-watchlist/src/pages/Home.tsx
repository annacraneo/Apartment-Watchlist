import React, { useState, useMemo } from "react";
import {
  useGetListings,
  useGetDashboardSummary,
  useCheckAllListings,
  useUpdateListing,
  useDeleteListing,
  getGetListingsQueryKey,
  getGetDashboardSummaryQueryKey,
  type GetListingsParams,
} from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  RefreshCw,
  MapPin,
  ArrowDown,
  ArrowUp,
  Trash2,
  Copy,
  Check,
  StickyNote,
  LayoutList,
  LayoutGrid,
  Train,
  BedDouble,
  Bath,
  Maximize2,
  Building2,
  Camera,
  Map as MapIcon,
  Car,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  MoreVertical,
  Flag,
  AlertCircle,
  Eye,
} from "lucide-react";
import { format, differenceInMinutes, differenceInHours, differenceInDays } from "date-fns";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";


import { AddListingDialog } from "@/components/AddListingDialog";
import { StatusBadge } from "@/components/StatusBadge";

function MultiFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (vals: string[]) => void;
}) {
  const toggle = (val: string) =>
    onChange(selected.includes(val) ? selected.filter((v) => v !== val) : [...selected, val]);
  const count = selected.length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={`h-7 px-3 text-xs rounded-md border bg-background flex items-center gap-1.5 hover:bg-accent transition-colors ${count > 0 ? "border-primary/50 text-foreground" : "text-muted-foreground"}`}>
          <span>{count > 0 ? `${label} (${count})` : label}</span>
          <ChevronDown className="w-3 h-3 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-1" align="start">
        {count > 0 && (
          <button
            className="text-[11px] text-muted-foreground px-2 py-1 w-full text-left hover:text-foreground rounded"
            onClick={() => onChange([])}
          >
            Clear selection
          </button>
        )}
        <div className="max-h-52 overflow-y-auto">
          {options.map((opt) => (
            <label
              key={opt}
              className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-accent cursor-pointer"
            >
              <Checkbox
                checked={selected.includes(opt)}
                onCheckedChange={() => toggle(opt)}
                className="h-3.5 w-3.5"
              />
              <span className="truncate">{opt}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface PriceChange {
  id: number;
  listingId: number;
  changedAt: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  changeType: string;
}

function stripBorough(address: string): string {
  return address.replace(/\s*\([^)]+\)\s*$/, "").trim();
}

function truncateAtSecondComma(address: string): string {
  const parts = address.split(",");
  return parts.slice(0, 2).join(",").trim();
}

function streetViewUrl(address: string, lat?: string | null, lng?: string | null): string {
  if (lat && lng) {
    return `https://www.google.com/maps?q=${encodeURIComponent(stripBorough(address))}&layer=c&cbll=${lat},${lng}`;
  }
  return `https://www.google.com/maps/search/${encodeURIComponent(stripBorough(address))}`;
}

function toMonthly(value: string | null | undefined): string {
  if (!value) return "—";
  const num = parseFloat(value.replace(/[^0-9.]/g, ""));
  if (isNaN(num) || num === 0) return "—";
  // Parser already stores monthly values with "/mo" suffix — display as-is
  if (/\/mo/i.test(value)) return `$${Math.round(num).toLocaleString("en-CA")}/mo`;
  // Legacy or alternate format: treat as yearly and convert
  return `$${Math.round(num / 12).toLocaleString("en-CA")}/mo`;
}

/** Extracts the numeric monthly dollar value from strings like "$243/mo". Returns Infinity for null/missing. */
function parseMonthly(s: string | null | undefined): number {
  if (!s) return Infinity;
  const m = s.match(/[\d,]+/);
  return m ? Number(m[0].replace(/,/g, "")) : Infinity;
}

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const mins = differenceInMinutes(new Date(), d);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}min ago`;
  const hrs = differenceInHours(new Date(), d);
  if (hrs < 24) return `${hrs}h ago`;
  const days = differenceInDays(new Date(), d);
  if (days < 7) return `${days}d ago`;
  if (days < 365) return format(d, "MMM d");
  return format(d, "MMM d, yy");
}

function isNewListing(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  return Date.now() - new Date(dateStr).getTime() < 24 * 60 * 60 * 1000;
}

function parsePriceChange(change: PriceChange) {
  const from = parseFloat(change.oldValue || "0");
  const to = parseFloat(change.newValue || "0");
  const delta = Math.abs(to - from);
  const isDown = change.changeType === "price_drop";
  return {
    label: `$${Math.round(delta).toLocaleString("en-CA")}`,
    isDown,
    date: format(new Date(change.changedAt), "MMM d"),
  };
}

function CopyText({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="ml-0.5 inline-flex items-center justify-center w-5 h-5 rounded text-foreground/70 hover:text-foreground hover:bg-muted transition-colors"
      title="Copy address"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

interface NotesPopoverProps {
  listingId: number;
  notes: string | null | undefined;
  onSave: (notes: string) => void;
  isPending: boolean;
}

function NotesPopover({ listingId, notes, onSave, isPending }: NotesPopoverProps) {
  const [open, setOpen] = useState(false);
  const [localNotes, setLocalNotes] = useState(notes || "");

  React.useEffect(() => {
    if (open) setLocalNotes(notes || "");
  }, [open, notes]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          title="Notes"
          data-testid={`btn-notes-${listingId}`}
        >
          <StickyNote className="w-3.5 h-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4 space-y-3" align="end">
        <p className="text-sm font-semibold">Notes</p>
        <Textarea
          value={localNotes}
          onChange={(e) => setLocalNotes(e.target.value)}
          placeholder="Personal notes..."
          className="text-sm min-h-[80px]"
        />
        <Button size="sm" className="w-full" onClick={() => { onSave(localNotes); setOpen(false); }} disabled={isPending}>
          Save
        </Button>
      </PopoverContent>
    </Popover>
  );
}


function CardImage({ src }: { src: string | null | undefined }) {
  const [error, setError] = useState(false);
  if (!src || error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted/60 via-muted/30 to-background/60">
        <Building2 className="w-16 h-16 text-muted-foreground/15" />
      </div>
    );
  }
  return <img src={src} alt="" className="w-full h-full object-cover" onError={() => setError(true)} />;
}

function TableThumb({ src }: { src: string | null | undefined }) {
  const [error, setError] = useState(false);
  if (!src || error) {
    return (
      <div className="w-28 h-16 rounded-md bg-muted/40 flex items-center justify-center flex-shrink-0">
        <Building2 className="w-4 h-4 text-muted-foreground/25" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="w-28 h-16 object-cover rounded-md flex-shrink-0"
      onError={() => setError(true)}
    />
  );
}

function InterestBadge({ level }: { level: string | null | undefined }) {
  if (!level || level === "none") return null;
  const cls =
    level === "high"
      ? "bg-primary/15 text-primary border-primary/30"
      : level === "medium"
      ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
      : "bg-muted/50 text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border ${cls}`}>
      {level}
    </span>
  );
}

const INTEREST_OPTIONS: Array<{ value: string | null; label: string }> = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: null, label: "None" },
];

function InlineInterest({
  level,
  onSet,
  isPending,
}: {
  level: string | null | undefined;
  onSet: (next: string | null) => void;
  isPending: boolean;
}) {
  const current = (!level || level === "none") ? null : level;
  const cls =
    current === "high"
      ? "bg-primary/15 text-primary border-primary/30"
      : current === "medium"
      ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
      : current === "low"
      ? "bg-muted/50 text-muted-foreground border-border"
      : "border-dashed border-muted-foreground/25 text-muted-foreground/40";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={isPending}>
        <button
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border transition-opacity hover:opacity-70 ${cls} ${isPending ? "opacity-50 cursor-wait" : "cursor-pointer"}`}
        >
          {current ?? "—"}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[100px]">
        {INTEREST_OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={String(opt.value)}
            onClick={() => onSet(opt.value)}
            className={`text-xs gap-2 ${current === opt.value ? "font-semibold" : ""}`}
          >
            {opt.value && (
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                opt.value === "high" ? "bg-primary" :
                opt.value === "medium" ? "bg-blue-400" :
                "bg-muted-foreground/40"
              }`} />
            )}
            {!opt.value && <span className="w-2 h-2 flex-shrink-0" />}
            {opt.label}
            {current === opt.value && <Check className="w-3 h-3 ml-auto" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SortableHeader({
  label,
  field,
  sortBy,
  sortDir,
  onSort,
}: {
  label: string;
  field: string;
  sortBy: string;
  sortDir: string;
  onSort: (field: string, dir: string) => void;
}) {
  const active = sortBy === field;
  const toggle = () => {
    if (!active) onSort(field, "asc");
    else onSort(field, sortDir === "asc" ? "desc" : "asc");
  };
  return (
    <button
      onClick={toggle}
      className={`flex items-center gap-0.5 hover:text-foreground transition-colors ${active ? "text-foreground" : "text-muted-foreground"}`}
    >
      {label}
      {active
        ? sortDir === "asc"
          ? <ChevronUp className="w-3 h-3" />
          : <ChevronDown className="w-3 h-3" />
        : <ChevronsUpDown className="w-3 h-3 opacity-40" />}
    </button>
  );
}

const PAGE_SIZE_OPTIONS = [10, 15, 20, 25, 50] as const;

function getPageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [1];
  if (current > 3) pages.push("…");
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p);
  if (current < total - 2) pages.push("…");
  pages.push(total);
  return pages;
}

export default function Home() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [interestLevel, setInterestLevel] = useState<string>("all");
  const [boroughs, setBoroughs] = useState<string[]>([]);
  const [condoTypes, setCondoTypes] = useState<string[]>([]);
  const [parkingInfos, setParkingInfos] = useState<string[]>([]);
  const [metros, setMetros] = useState<string[]>([]);
  const [visitNextOnly, setVisitNextOnly] = useState(false);
  const [visitedOnly, setVisitedOnly] = useState(false);
  const [sortBy, setSortBy] = useState("updatedAt");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(() => {
    const saved = localStorage.getItem("watchlist-page-size");
    return saved && PAGE_SIZE_OPTIONS.includes(Number(saved) as typeof PAGE_SIZE_OPTIONS[number])
      ? Number(saved)
      : 15;
  });

  const onSort = (field: string, dir: string) => { setSortBy(field); setSortDir(dir); };
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<"table" | "card">("table");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  React.useEffect(() => { setPage(1); }, [debouncedSearch, status, interestLevel, boroughs, parkingInfos, condoTypes, metros, visitNextOnly, visitedOnly, pageSize]);

  const queryParams: GetListingsParams = {
    search: debouncedSearch || undefined,
    status: (status !== "all" && status !== "new") ? status : undefined,
    interestLevel: interestLevel !== "all" ? interestLevel : undefined,
    sortBy: (sortBy === "condoFees" || sortBy === "taxes") ? "updatedAt" : sortBy,
    sortDir,
  };

  const { data: allListings, isLoading: isLoadingListings } = useGetListings(queryParams, {
    query: {
      queryKey: getGetListingsQueryKey(queryParams),
      refetchInterval: 60000,
    },
  });

  const { data: priceHistory } = useQuery<PriceChange[]>({
    queryKey: ["recent-price-changes"],
    queryFn: async () => {
      const res = await fetch("/api/listings/recent-price-changes?days=60");
      if (!res.ok) throw new Error("Failed to fetch price changes");
      return res.json();
    },
    refetchInterval: 60000,
  });

  const priceHistoryMap = useMemo(() => {
    const map = new Map<number, PriceChange>();
    (priceHistory ?? []).forEach((c) => map.set(c.listingId, c));
    return map;
  }, [priceHistory]);

  const listings = useMemo(() => {
    if (!allListings) return [];
    let filtered = allListings.filter((l) => {
      if (boroughs.length > 0 && !boroughs.includes(l.neighborhood || "")) return false;
      if (parkingInfos.length > 0 && !parkingInfos.includes(l.parkingInfo || "")) return false;
      if (condoTypes.length > 0 && !condoTypes.includes(l.propertyType || "")) return false;
      if (metros.length > 0 && !metros.includes(l.nearestMetro || "")) return false;
      if (visitNextOnly && !l.visitNext) return false;
      if (visitedOnly && !l.visited) return false;
      if (status === "new" && !isNewListing(l.firstSavedAt)) return false;
      return true;
    });
    // condoFees / taxes are text columns — sort client-side after filtering
    if (sortBy === "condoFees" || sortBy === "taxes") {
      filtered = [...filtered].sort((a, b) => {
        if (a.visitNext && !b.visitNext) return -1;
        if (!a.visitNext && b.visitNext) return 1;
        const va = parseMonthly(sortBy === "condoFees" ? a.condoFees : a.taxes);
        const vb = parseMonthly(sortBy === "condoFees" ? b.condoFees : b.taxes);
        return sortDir === "asc" ? va - vb : vb - va;
      });
    }
    return filtered;
  }, [allListings, boroughs, parkingInfos, condoTypes, metros, visitNextOnly, visitedOnly, sortBy, sortDir]);

  const totalCount = allListings?.length ?? 0;
  const filteredCount = listings.length;
  const pageCount = Math.max(1, Math.ceil(filteredCount / pageSize));
  const safePage = Math.min(page, pageCount);
  const firstItem = filteredCount === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const lastItem = Math.min(safePage * pageSize, filteredCount);
  const paginatedListings = listings.slice((safePage - 1) * pageSize, safePage * pageSize);
  const isFiltered = filteredCount !== totalCount;

  const checkAll = useCheckAllListings({
    mutation: {
      onSuccess: (data) => {
        if (data.totalChanges === 0) {
          toast({ title: "All up to date", description: `Checked ${data.checked} listings, no changes found.` });
        } else {
          const fmtAddr = (addr: string | null) => {
            if (!addr) return "Unknown";
            const m = addr.match(/^(\d+[^,]*,[^,]+)/);
            return m ? m[1].trim() : addr.split(",")[0].trim();
          };
          const fmtVal = (v: string | null) => {
            if (!v) return "—";
            const n = parseFloat(v);
            return isNaN(n) ? v : `$${n.toLocaleString("en-CA")}`;
          };
          const lines = (data.changes ?? []).slice(0, 4).map((c) => {
            const addr = fmtAddr(c.address);
            if (c.changeType === "price_drop") return `↓ ${addr}: ${fmtVal(c.oldValue)} → ${fmtVal(c.newValue)}`;
            if (c.changeType === "price_increase") return `↑ ${addr}: ${fmtVal(c.oldValue)} → ${fmtVal(c.newValue)}`;
            if (c.changeType === "status_change") return `${addr}: ${c.oldValue} → ${c.newValue}`;
            return `${addr}: ${c.fieldName} changed`;
          });
          const extra = data.totalChanges > 4 ? `\n+${data.totalChanges - 4} more` : "";
          toast({ title: `${data.totalChanges} change${data.totalChanges !== 1 ? "s" : ""} found`, description: lines.join("\n") + extra });
        }
        queryClient.invalidateQueries({ queryKey: getGetListingsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["recent-price-changes"] });
      },
    },
  });

  const updateListing = useUpdateListing({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetListingsQueryKey() }),
      onError: () => toast({ title: "Failed to save", variant: "destructive" }),
    },
  });

  const deleteListing = useDeleteListing({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetListingsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        toast({ title: "Listing deleted" });
      },
      onError: () => toast({ title: "Failed to delete listing", variant: "destructive" }),
    },
  });

  const bulkDelete = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await fetch("/api/listings/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error("Bulk delete failed");
      return res.json() as Promise<{ deleted: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: getGetListingsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      setSelectedIds(new Set());
      toast({ title: `Deleted ${data.deleted} listing${data.deleted !== 1 ? "s" : ""}` });
    },
    onError: () => toast({ title: "Bulk delete failed", variant: "destructive" }),
  });

  const fmt = (val: string | null | undefined) => val || "—";
  const fmtPrice = (val: string | null | undefined) => {
    if (!val) return "—";
    const n = Number(val.replace(/[^0-9.]/g, ""));
    return isNaN(n) ? val : `$${n.toLocaleString("en-CA")}`;
  };

  const notesProps = (listing: (typeof listings)[0]) => ({
    listingId: listing.id,
    notes: listing.notes,
    isPending: updateListing.isPending,
    onSave: (notes: string) =>
      updateListing.mutate({ id: listing.id, data: { notes: notes || null } }),
  });

  const onSetInterest = (id: number) => (next: string | null) =>
    updateListing.mutate({ id, data: { interestLevel: next } });

  const boroughOptions = [...new Set((allListings ?? []).map((l) => l.neighborhood).filter(Boolean))].sort() as string[];
  const parkingOptions = [...new Set((allListings ?? []).map((l) => l.parkingInfo).filter(Boolean))].sort() as string[];
  const metroOptions = [...new Set((allListings ?? []).map((l) => l.nearestMetro).filter(Boolean))].sort() as string[];
  const condoTypeOptions = [...new Set((allListings ?? []).map((l) => l.propertyType).filter(Boolean))].sort() as string[];

  const EmptyState = () => (
    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
      <MapPin className="w-10 h-10 opacity-30" />
      <p className="text-sm font-medium">No listings found</p>
      {(debouncedSearch || status !== "all" || interestLevel !== "all" || boroughs.length > 0 || parkingInfos.length > 0 || condoTypes.length > 0 || metros.length > 0 || visitNextOnly || visitedOnly) && (
        <Button variant="outline" size="sm" onClick={() => { setSearch(""); setStatus("all"); setInterestLevel("all"); setBoroughs([]); setParkingInfos([]); setCondoTypes([]); setMetros([]); setVisitNextOnly(false); setVisitedOnly(false); }}>
          Clear filters
        </Button>
      )}
    </div>
  );

  return (
    <div className="flex-1 p-4 md:p-6 container mx-auto space-y-4 max-w-[1800px]">
      <div className="bg-card border rounded-xl overflow-hidden flex flex-col shadow-md">

        {/* Toolbar */}
        <div className="px-4 py-3 border-b flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
          <div className="flex items-center gap-2.5 flex-1 w-full md:max-w-lg">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search address, borough, notes…"
                className="pl-9 h-9 bg-background text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-search-listings"
              />
            </div>
            {!isLoadingListings && (
              <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0 tabular-nums">
                {isFiltered
                  ? <><span className="font-semibold text-foreground">{filteredCount}</span> of {totalCount}</>
                  : <><span className="font-semibold text-foreground">{totalCount}</span></>
                }
                {" "}listing{totalCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {selectedIds.size > 0 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const selected = (allListings ?? []).filter((l) => selectedIds.has(l.id));
                    const lines = selected.map((l) => ({
                      address: l.address || l.title || "",
                      borough: l.neighborhood || "",
                      url: l.listingUrl || "",
                    }));
                    const htmlLines = lines.map(({ address, url, borough }) => {
                      const linked = url ? `<a href="${url}">${address}</a>` : address;
                      return borough ? `${linked} - ${borough}` : linked;
                    });
                    const plainLines = lines.map(({ address, borough }) =>
                      borough ? `${address} - ${borough}` : address
                    );
                    const htmlBlob = new Blob(
                      [`<meta charset="utf-8">${htmlLines.join("<br>")}`],
                      { type: "text/html" }
                    );
                    const textBlob = new Blob([plainLines.join("\n")], { type: "text/plain" });
                    navigator.clipboard.write([new ClipboardItem({ "text/html": htmlBlob, "text/plain": textBlob })]).then(() => {
                      toast({ title: `Copied ${selected.length} listing${selected.length !== 1 ? "s" : ""}` });
                    });
                  }}
                  data-testid="btn-bulk-copy"
                >
                  <Copy className="w-3.5 h-3.5 mr-1.5" />
                  Copy {selectedIds.size}
                </Button>
                {(() => {
                  const selectedListings = (allListings ?? []).filter((l) => selectedIds.has(l.id));
                  const allFlagged = selectedListings.length > 0 && selectedListings.every((l) => l.visitNext);
                  return (
                    <Button
                      variant="outline"
                      size="sm"
                      className={allFlagged ? "border-violet-500/70 text-violet-500 hover:bg-violet-500/10" : "border-violet-500/50 text-violet-500 hover:bg-violet-500/10"}
                      disabled={updateListing.isPending}
                      onClick={async () => {
                        const next = !allFlagged;
                        await Promise.all(
                          Array.from(selectedIds).map((id) =>
                            updateListing.mutateAsync({ id, data: { visitNext: next } })
                          )
                        );
                        toast({ title: next ? `Flagged ${selectedIds.size} for visit` : `Unflagged ${selectedIds.size}` });
                      }}
                      data-testid="btn-bulk-flag"
                    >
                      <Flag className={`w-3.5 h-3.5 mr-1.5 ${allFlagged ? "fill-violet-500/50" : ""}`} />
                      {allFlagged ? `Unflag ${selectedIds.size}` : `Flag ${selectedIds.size}`}
                    </Button>
                  );
                })()}
                <Button variant="destructive" size="sm" onClick={() => bulkDelete.mutate(Array.from(selectedIds))} disabled={bulkDelete.isPending} data-testid="btn-bulk-delete">
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  Delete {selectedIds.size}
                </Button>
              </>
            )}
            <AddListingDialog />
            <Button variant="outline" size="sm" onClick={() => checkAll.mutate()} disabled={checkAll.isPending} data-testid="btn-check-all">
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${checkAll.isPending ? "animate-spin" : ""}`} />
              Check All
            </Button>
            <div className="flex items-center rounded-lg border bg-muted/30 p-0.5 gap-0.5">
              <Button
                variant={viewMode === "table" ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => setViewMode("table")}
                title="Table view"
              >
                <LayoutList className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant={viewMode === "card" ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => setViewMode("card")}
                title="Card view"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="px-4 py-2.5 border-b flex flex-wrap gap-2 items-center bg-muted/10">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[130px] h-7 text-xs" data-testid="filter-status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="new">New (24h)</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>

          <Select value={interestLevel} onValueChange={setInterestLevel}>
            <SelectTrigger className="w-[120px] h-7 text-xs" data-testid="filter-interest">
              <SelectValue placeholder="Interest" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Interest</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>

          <MultiFilter label="Borough" options={boroughOptions} selected={boroughs} onChange={setBoroughs} />
          <MultiFilter label="Metro" options={metroOptions} selected={metros} onChange={setMetros} />
          <MultiFilter label="Parking" options={parkingOptions} selected={parkingInfos} onChange={setParkingInfos} />
          <MultiFilter label="Type" options={condoTypeOptions} selected={condoTypes} onChange={setCondoTypes} />

          <button
            onClick={() => setVisitNextOnly((v) => !v)}
            className={`h-7 px-3 text-xs rounded-md border flex items-center gap-1.5 transition-colors ${visitNextOnly ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground hover:bg-accent"}`}
          >
            <Flag className="w-3 h-3" />
            Visit Next
          </button>

          <button
            onClick={() => setVisitedOnly((v) => !v)}
            className={`h-7 px-3 text-xs rounded-md border flex items-center gap-1.5 transition-colors ${visitedOnly ? "bg-emerald-600 text-white border-emerald-600" : "bg-background text-muted-foreground hover:bg-accent"}`}
          >
            <Eye className="w-3 h-3" />
            Visited
          </button>

          <Select value={`${sortBy}-${sortDir}`} onValueChange={(v) => { const [by, dir] = v.split("-"); setSortBy(by); setSortDir(dir); }}>
            <SelectTrigger className="w-[170px] h-7 text-xs" data-testid="filter-sort">
              <SelectValue placeholder="Sort By" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updatedAt-desc">Recently Updated</SelectItem>
              <SelectItem value="currentPrice-asc">Price ↑</SelectItem>
              <SelectItem value="currentPrice-desc">Price ↓</SelectItem>
              <SelectItem value="firstSavedAt-desc">Recently Added</SelectItem>
              <SelectItem value="condoFees-asc">Fees ↑</SelectItem>
              <SelectItem value="condoFees-desc">Fees ↓</SelectItem>
              <SelectItem value="taxes-asc">Taxes ↑</SelectItem>
              <SelectItem value="taxes-desc">Taxes ↓</SelectItem>
            </SelectContent>
          </Select>

          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Rows:</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                const n = Number(v);
                setPageSize(n);
                localStorage.setItem("watchlist-page-size", String(n));
              }}
            >
              <SelectTrigger className="w-[70px] h-7 text-xs" data-testid="filter-page-size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── TABLE VIEW ── */}
        {viewMode === "table" && (
          <div className="overflow-x-auto">
            <Table className="text-xs min-w-[1500px]">
              <TableHeader className="bg-muted/30 sticky top-0">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-8 px-2">
                    <Checkbox
                      checked={paginatedListings.length > 0 && paginatedListings.every((l) => selectedIds.has(l.id))}
                      onCheckedChange={(checked) => setSelectedIds((prev) => {
                        const next = new Set(prev);
                        paginatedListings.forEach((l) => checked ? next.add(l.id) : next.delete(l.id));
                        return next;
                      })}
                      aria-label="Select all on page"
                    />
                  </TableHead>
                  <TableHead className="w-16 px-1">
                    <div className="flex items-center justify-center gap-1">
                      <TooltipProvider delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Flag className="w-3.5 h-3.5 text-muted-foreground/40" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[200px] text-center">
                            Visit Next — flag a listing you want to visit soon. Flagged listings always appear at the top.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Eye className="w-3.5 h-3.5 text-muted-foreground/40" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[200px] text-center">
                            Visited — mark a listing you have already visited in person.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </TableHead>
                  <TableHead className="w-32"></TableHead>
                  <TableHead className="min-w-[220px]">Address</TableHead>
                  <TableHead className="w-28">
                    <SortableHeader label="Price" field="currentPrice" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  </TableHead>
                  <TableHead className="w-28">
                    <SortableHeader label="Specs" field="bedrooms" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  </TableHead>
                  <TableHead className="w-24">
                    <SortableHeader label="Net Area" field="squareFeet" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  </TableHead>
                  <TableHead className="w-28">Type</TableHead>
                  <TableHead className="w-32">Borough</TableHead>
                  <TableHead className="w-20">
                    <SortableHeader label="Interest" field="interestLevel" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  </TableHead>
                  <TableHead className="w-32">Parking</TableHead>
                  <TableHead className="w-28">
                    <SortableHeader label="Metro" field="walkingMinutes" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  </TableHead>
                  <TableHead className="w-24">Fees</TableHead>
                  <TableHead className="w-24">Tax</TableHead>
                  <TableHead className="w-32">Price History</TableHead>
                  <TableHead className="w-10 text-center">Notes</TableHead>
                  <TableHead className="w-28 text-left">Last Checked</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingListings ? (
                  Array.from({ length: pageSize }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 18 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : listings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={18}>
                      <EmptyState />
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedListings.map((listing) => {
                    const pc = priceHistoryMap.get(listing.id);
                    const pcd = pc ? parsePriceChange(pc) : null;
                    return (
                      <TableRow
                        key={listing.id}
                        className={`group ${listing.visitNext ? "bg-violet-500/10 hover:bg-violet-500/15" : ""}`}
                        data-testid={`row-listing-${listing.id}`}
                      >
                        <TableCell className="px-2">
                          <Checkbox
                            checked={selectedIds.has(listing.id)}
                            onCheckedChange={(checked) => {
                              setSelectedIds((prev) => {
                                const next = new Set(prev);
                                if (checked) next.add(listing.id); else next.delete(listing.id);
                                return next;
                              });
                            }}
                            aria-label={`Select ${listing.id}`}
                          />
                        </TableCell>

                        {/* Visit Next + Visited flags */}
                        <TableCell className="px-1 text-center">
                          <div className="flex items-center justify-center gap-0.5">
                            <TooltipProvider delayDuration={300}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`h-6 w-6 transition-colors ${listing.visitNext ? "text-violet-500" : "text-muted-foreground/25 hover:text-violet-500 opacity-0 group-hover:opacity-100"}`}
                                    onClick={() => updateListing.mutate({ id: listing.id, data: { visitNext: !listing.visitNext } })}
                                  >
                                    <Flag className={`w-3 h-3 ${listing.visitNext ? "fill-violet-500/50" : ""}`} />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="right">
                                  {listing.visitNext ? "Remove from Visit Next" : "Mark as Visit Next"}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider delayDuration={300}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`h-6 w-6 transition-colors ${listing.visited ? "text-emerald-500" : "text-muted-foreground/25 hover:text-emerald-500 opacity-0 group-hover:opacity-100"}`}
                                    onClick={() => updateListing.mutate({ id: listing.id, data: { visited: !listing.visited } })}
                                  >
                                    <Eye className={`w-3 h-3 ${listing.visited ? "fill-emerald-500/30" : ""}`} />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="right">
                                  {listing.visited ? "Mark as not visited" : "Mark as visited"}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </TableCell>

                        {/* Thumbnail */}
                        <TableCell className="px-1.5 py-1">
                          <TableThumb src={listing.mainImageUrl} />
                        </TableCell>

                        {/* Address */}
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-1">
                            <span
                              title={listing.listingStatus ?? "unknown"}
                              className={`flex-shrink-0 block w-2 h-2 rounded-full ${listing.listingStatus === "active" ? "bg-emerald-500" : "bg-red-500"}`}
                            />
                            {listing.listingUrl ? (
                              <a
                                href={listing.listingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="truncate max-w-[200px] hover:text-primary hover:underline transition-colors"
                                title={listing.address || listing.title || listing.listingUrl}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {truncateAtSecondComma(stripBorough(listing.address || listing.title || listing.listingUrl || ""))}
                              </a>
                            ) : (
                              <span className="truncate max-w-[200px]" title={listing.address || listing.title || ""}>
                                {truncateAtSecondComma(stripBorough(listing.address || listing.title || ""))}
                              </span>
                            )}
                            {(listing.address || listing.title) && (
                              <a
                                href={streetViewUrl(listing.address || listing.title || "", listing.latitude, listing.longitude)}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Open in Google Maps Street View"
                                className="inline-flex items-center justify-center w-5 h-5 rounded text-foreground/70 hover:text-primary hover:bg-muted transition-colors flex-shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MapIcon className="w-3.5 h-3.5" />
                              </a>
                            )}
                            {(listing.address || listing.title) && (
                              <CopyText text={stripBorough(listing.address || listing.title || "")} />
                            )}
                            {isNewListing(listing.firstSavedAt) && (
                              <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 leading-none">
                                NEW
                              </span>
                            )}
                            {listing.listingStatus === "unavailable" && (
                              <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 leading-none">
                                INACTIVE
                              </span>
                            )}
                          </div>
                        </TableCell>

                        {/* Price */}
                        <TableCell>
                          <span className="font-semibold tabular-nums">{fmtPrice(listing.currentPrice)}</span>
                        </TableCell>

                        {/* Specs */}
                        <TableCell className="text-muted-foreground">
                          {fmt(listing.bedrooms)} bd · {fmt(listing.bathrooms)} ba
                        </TableCell>

                        {/* Net Area */}
                        <TableCell className="text-muted-foreground tabular-nums text-xs leading-tight">
                          {listing.squareFeet ? (
                            <>
                              <span className="block">{listing.squareFeet} ft²</span>
                              <span className="block text-muted-foreground/60">{Math.round(Number(listing.squareFeet) * 0.0929)} m²</span>
                            </>
                          ) : "—"}
                        </TableCell>

                        {/* Type */}
                        <TableCell className="text-muted-foreground">{fmt(listing.propertyType)}</TableCell>

                        {/* Borough */}
                        <TableCell className="text-muted-foreground">{fmt(listing.neighborhood)}</TableCell>

                        {/* Interest */}
                        <TableCell>
                          <InlineInterest level={listing.interestLevel} onSet={onSetInterest(listing.id)} isPending={updateListing.isPending} />
                        </TableCell>

                        {/* Parking */}
                        <TableCell className="text-muted-foreground">{fmt(listing.parkingInfo)}</TableCell>

                        {/* Metro */}
                        <TableCell>
                          {listing.nearestMetro ? (
                            <div className="flex flex-col leading-tight">
                              <span className="font-medium truncate max-w-[110px]">{listing.nearestMetro}</span>
                              <span className={`text-[10px] flex items-center gap-0.5 ${Number(listing.walkingMinutes) > 15 ? "text-amber-500" : "text-muted-foreground"}`}>
                                {listing.walkingMinutes} min walk
                                {Number(listing.walkingMinutes) > 15 && <AlertCircle className="w-3.5 h-3.5" />}
                              </span>
                            </div>
                          ) : "—"}
                        </TableCell>

                        {/* Condo Fees/mo */}
                        <TableCell className={`tabular-nums ${!!listing.condoFees && parseMonthly(listing.condoFees) > 450 ? "text-amber-500" : "text-muted-foreground"}`}>
                          <span className="flex items-center gap-1">
                            {fmt(listing.condoFees)}
                            {!!listing.condoFees && parseMonthly(listing.condoFees) > 450 && <AlertCircle className="w-3 h-3 shrink-0" />}
                          </span>
                        </TableCell>

                        {/* Tax/mo */}
                        <TableCell className={`tabular-nums ${!!listing.taxes && parseMonthly(listing.taxes) > 450 ? "text-amber-500" : "text-muted-foreground"}`}>
                          <span className="flex items-center gap-1">
                            {toMonthly(listing.taxes)}
                            {!!listing.taxes && parseMonthly(listing.taxes) > 450 && <AlertCircle className="w-3 h-3 shrink-0" />}
                          </span>
                        </TableCell>

                        {/* Price History (60d) */}
                        <TableCell>
                          {pcd ? (
                            <div className={`flex items-center gap-0.5 font-medium ${pcd.isDown ? "text-emerald-400" : "text-red-400"}`}>
                              {pcd.isDown ? <ArrowDown className="w-3 h-3 flex-shrink-0" /> : <ArrowUp className="w-3 h-3 flex-shrink-0" />}
                              <span>{pcd.label}</span>
                              <span className="text-muted-foreground font-normal ml-1">· {pcd.date}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        {/* Notes + actions */}
                        <TableCell>
                          <div className="flex items-center gap-0.5">
                            <NotesPopover {...notesProps(listing)} />
                          </div>
                        </TableCell>

                        {/* Last checked */}
                        <TableCell className="text-left text-muted-foreground tabular-nums">
                          {timeAgo(listing.updatedAt)}
                        </TableCell>

                        {/* Row actions */}
                        <TableCell className="px-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreVertical className="w-3.5 h-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive focus:bg-destructive/10 gap-2"
                                onClick={() => deleteListing.mutate({ id: listing.id })}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete listing
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* ── CARD VIEW ── */}
        {viewMode === "card" && (
          <div className="p-4 md:p-6">
            {isLoadingListings ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-64 rounded-xl" />
                ))}
              </div>
            ) : listings.length === 0 ? (
              <EmptyState />
            ) : (
              <>
              <div className="flex items-center gap-1 mb-4 flex-wrap">
                <span className="text-xs text-muted-foreground mr-1">Sort:</span>
                {([
                  { label: "Price", field: "currentPrice", defaultDir: "asc" },
                  { label: "Beds", field: "bedrooms", defaultDir: "desc" },
                  { label: "Net Area", field: "squareFeet", defaultDir: "desc" },
                  { label: "Interest", field: "interestLevel", defaultDir: "desc" },
                  { label: "Metro", field: "walkingMinutes", defaultDir: "asc" },
                  { label: "Fees", field: "condoFees", defaultDir: "asc" },
                  { label: "Taxes", field: "taxes", defaultDir: "asc" },
                  { label: "Recent", field: "updatedAt", defaultDir: "desc" },
                ] as { label: string; field: string; defaultDir: "asc" | "desc" }[]).map(({ label, field, defaultDir }) => {
                  const active = sortBy === field;
                  return (
                    <button
                      key={field}
                      onClick={() => active ? setSortDir(d => d === "asc" ? "desc" : "asc") : onSort(field, defaultDir)}
                      className={`inline-flex items-center gap-0.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        active
                          ? "bg-primary/15 text-primary border-primary/30"
                          : "bg-muted/40 text-muted-foreground border-border hover:text-foreground"
                      }`}
                    >
                      {label}
                      {active
                        ? sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                        : <ChevronsUpDown className="w-3 h-3 opacity-40" />}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {paginatedListings.map((listing) => {
                  const pc = priceHistoryMap.get(listing.id);
                  const pcd = pc ? parsePriceChange(pc) : null;
                  const isSelected = selectedIds.has(listing.id);
                  const streetAddress = truncateAtSecondComma(stripBorough(listing.address || listing.title || ""));
                  const borough = listing.neighborhood || (() => { const m = (listing.address || "").match(/\(([^)]+)\)\s*$/); return m ? m[1] : null; })();

                  return (
                    <div
                      key={listing.id}
                      className={`group flex flex-col rounded-2xl border overflow-hidden transition-all duration-200 hover:shadow-xl hover:shadow-black/30 hover:-translate-y-0.5 ${
                        listing.visitNext
                          ? "bg-violet-500/10 border-violet-500/50 ring-1 ring-violet-500/30"
                          : isSelected
                          ? "bg-card border-primary/50 ring-1 ring-primary/30"
                          : "bg-card border-border hover:border-border/80"
                      }`}
                      data-testid={`card-listing-${listing.id}`}
                    >
                      {/* ── Card image ── */}
                      <div className="relative w-full h-44 overflow-hidden bg-muted/20 flex-shrink-0">
                        <CardImage src={listing.mainImageUrl} />
                      </div>

                      {/* ── Card content ── */}
                      <div className="flex flex-col flex-1 p-4 gap-3">

                        {/* Top row: checkbox + status */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <StatusBadge status={listing.listingStatus} />
                            {isNewListing(listing.firstSavedAt) && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 leading-none">
                                NEW
                              </span>
                            )}
                          </div>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => {
                              setSelectedIds((prev) => {
                                const next = new Set(prev);
                                if (checked) next.add(listing.id); else next.delete(listing.id);
                                return next;
                              });
                            }}
                            aria-label={`Select listing ${listing.id}`}
                            className="opacity-0 group-hover:opacity-100 transition-opacity data-[state=checked]:opacity-100"
                          />
                        </div>

                        {/* Price row */}
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-2xl font-bold tracking-tight tabular-nums leading-none">
                              {listing.currentPrice
                                ? `$${Number(listing.currentPrice.replace(/[^0-9.]/g, "")).toLocaleString("en-CA")}`
                                : "—"}
                            </p>
                            {pcd && (
                              <span className={`inline-flex items-center gap-0.5 text-xs font-medium mt-0.5 ${pcd.isDown ? "text-emerald-400" : "text-red-400"}`}>
                                {pcd.isDown ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />}
                                {pcd.label} · {pcd.date}
                              </span>
                            )}
                          </div>
                          <InlineInterest level={listing.interestLevel} onSet={onSetInterest(listing.id)} isPending={updateListing.isPending} />
                        </div>

                        {/* Property type */}
                        {listing.propertyType && (
                          <p className="text-sm text-muted-foreground -mt-1">
                            {listing.propertyType} condo
                          </p>
                        )}

                        {/* Address */}
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {listing.listingUrl ? (
                              <a
                                href={listing.listingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm font-medium leading-snug hover:text-primary hover:underline transition-colors"
                              >
                                {streetAddress || listing.listingUrl}
                              </a>
                            ) : (
                              <p className="text-sm font-medium leading-snug">{streetAddress}</p>
                            )}
                            {streetAddress && (
                              <a
                                href={streetViewUrl(listing.address || listing.title || streetAddress, listing.latitude, listing.longitude)}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Open in Google Maps Street View"
                                className="inline-flex items-center justify-center w-5 h-5 rounded text-foreground/70 hover:text-primary hover:bg-muted transition-colors"
                              >
                                <MapIcon className="w-3.5 h-3.5" />
                              </a>
                            )}
                            {streetAddress && <CopyText text={streetAddress} />}
                          </div>
                          {borough && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {listing.city || "Montréal"} · {borough}
                            </p>
                          )}
                        </div>

                        <div className="h-px bg-border/50" />

                        {/* Specs row */}
                        <div className="flex items-center gap-4 text-sm">
                          {listing.bedrooms && (
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <BedDouble className="w-4 h-4 flex-shrink-0" />
                              <span className="font-semibold text-foreground">{listing.bedrooms}</span>
                            </span>
                          )}
                          {listing.bathrooms && (
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <Bath className="w-4 h-4 flex-shrink-0" />
                              <span className="font-semibold text-foreground">{listing.bathrooms}</span>
                            </span>
                          )}
                          {listing.squareFeet && (
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <Maximize2 className="w-3.5 h-3.5 flex-shrink-0" />
                              <span className="font-semibold text-foreground tabular-nums">{listing.squareFeet}</span>
                              <span className="text-xs">ft²</span>
                              <span className="text-xs text-muted-foreground/60">/ {Math.round(Number(listing.squareFeet) * 0.0929)} m²</span>
                            </span>
                          )}
                          {listing.parkingInfo && (
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <Car className="w-3.5 h-3.5 flex-shrink-0" />
                              <span className="font-semibold text-foreground">
                                {listing.parkingInfo.replace(/\s*\([^)]+\)/g, "").trim()}
                              </span>
                            </span>
                          )}
                        </div>

                        {/* Metro */}
                        {listing.nearestMetro && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Train className="w-3.5 h-3.5 flex-shrink-0 text-primary/70" />
                            <span className="font-medium text-foreground/80">{listing.nearestMetro}</span>
                            <span className={`flex items-center gap-0.5 ${Number(listing.walkingMinutes) > 15 ? "text-amber-500" : ""}`}>
                              · {listing.walkingMinutes} min walk
                              {Number(listing.walkingMinutes) > 15 && <AlertCircle className="w-3.5 h-3.5" />}
                            </span>
                          </div>
                        )}

                        <div className="h-px bg-border/50" />

                        {/* Financials */}
                        <div className="grid grid-cols-2 gap-1.5">
                          <div className="rounded bg-muted/40 px-2 py-1">
                            <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Condo fees</p>
                            <p className={`text-xs font-semibold tabular-nums flex items-center gap-1 ${!!listing.condoFees && parseMonthly(listing.condoFees) > 450 ? "text-amber-500" : ""}`}>
                              {fmt(listing.condoFees)}
                              {!!listing.condoFees && parseMonthly(listing.condoFees) > 450 && <AlertCircle className="w-3 h-3 shrink-0" />}
                            </p>
                          </div>
                          <div className="rounded bg-muted/40 px-2 py-1">
                            <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Tax</p>
                            <p className={`text-xs font-semibold tabular-nums flex items-center gap-1 ${!!listing.taxes && parseMonthly(listing.taxes) > 450 ? "text-amber-500" : ""}`}>
                              {toMonthly(listing.taxes)}
                              {!!listing.taxes && parseMonthly(listing.taxes) > 450 && <AlertCircle className="w-3 h-3 shrink-0" />}
                            </p>
                          </div>
                        </div>

                      </div>
                      {/* ── Footer ── */}
                      <div className="px-4 py-2.5 border-t border-border/50 flex items-center justify-between bg-muted/10">
                        <span className="text-[11px] text-muted-foreground">{timeAgo(listing.updatedAt)}</span>
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-7 w-7 transition-colors ${listing.visited ? "text-emerald-500" : "text-muted-foreground/40 hover:text-emerald-500 opacity-0 group-hover:opacity-100 data-[visited=true]:opacity-100"}`}
                            data-visited={listing.visited}
                            title={listing.visited ? "Mark as not visited" : "Mark as visited"}
                            onClick={() => updateListing.mutate({ id: listing.id, data: { visited: !listing.visited } })}
                          >
                            <Eye className={`w-3.5 h-3.5 ${listing.visited ? "fill-emerald-500/20" : ""}`} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-7 w-7 transition-colors ${listing.visitNext ? "text-violet-500" : "text-muted-foreground/40 hover:text-violet-500 opacity-0 group-hover:opacity-100 data-[flagged=true]:opacity-100"}`}
                            data-flagged={listing.visitNext}
                            title={listing.visitNext ? "Remove visit flag" : "Flag to visit next"}
                            onClick={() => updateListing.mutate({ id: listing.id, data: { visitNext: !listing.visitNext } })}
                          >
                            <Flag className={`w-3.5 h-3.5 ${listing.visitNext ? "fill-violet-500/50" : ""}`} />
                          </Button>
                          <NotesPopover {...notesProps(listing)} />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => deleteListing.mutate({ id: listing.id })}
                            data-testid={`btn-card-delete-${listing.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              </>
            )}
          </div>
        )}
        {/* ── PAGINATION FOOTER ── */}
        {!isLoadingListings && filteredCount > 0 && (
          <div className="px-4 py-3 border-t flex items-center justify-between gap-4 flex-wrap bg-muted/10">
            <span className="text-xs text-muted-foreground tabular-nums shrink-0">
              Showing{" "}
              <span className="font-medium text-foreground">{firstItem}–{lastItem}</span>
              {" "}of{" "}
              <span className="font-medium text-foreground">{filteredCount}</span>
              {isFiltered && <span className="text-muted-foreground/60"> (filtered from {totalCount})</span>}
            </span>

            {pageCount > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  aria-label="Previous page"
                >
                  ← Prev
                </Button>

                {getPageNumbers(safePage, pageCount).map((p, i) =>
                  p === "…" ? (
                    <span key={`ellipsis-${i}`} className="px-1.5 text-xs text-muted-foreground select-none">…</span>
                  ) : (
                    <Button
                      key={p}
                      variant={p === safePage ? "default" : "outline"}
                      size="sm"
                      className="h-7 w-7 text-xs p-0"
                      onClick={() => setPage(p)}
                      aria-label={`Page ${p}`}
                      aria-current={p === safePage ? "page" : undefined}
                    >
                      {p}
                    </Button>
                  )
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={safePage === pageCount}
                  aria-label="Next page"
                >
                  Next →
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
