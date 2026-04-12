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
  ExternalLink,
  LayoutList,
  LayoutGrid,
  Train,
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

import { AddListingDialog } from "@/components/AddListingDialog";
import { StatusBadge } from "@/components/StatusBadge";

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

function toMonthly(yearly: string | null | undefined): string {
  if (!yearly) return "—";
  const num = parseFloat(yearly.replace(/[^0-9.]/g, ""));
  if (isNaN(num) || num === 0) return "—";
  return `$${Math.round(num / 12).toLocaleString("en-CA")}/mo`;
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
      className="ml-1 inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
      title="Copy address"
    >
      {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

interface NotesPopoverProps {
  listingId: number;
  notes: string | null | undefined;
  interestLevel: string | null | undefined;
  onSave: (data: { notes: string; interestLevel: string }) => void;
  isPending: boolean;
}

function NotesPopover({ listingId, notes, interestLevel, onSave, isPending }: NotesPopoverProps) {
  const [open, setOpen] = useState(false);
  const [localNotes, setLocalNotes] = useState(notes || "");
  const [localInterest, setLocalInterest] = useState(interestLevel || "");

  React.useEffect(() => {
    if (open) {
      setLocalNotes(notes || "");
      setLocalInterest(interestLevel || "");
    }
  }, [open, notes, interestLevel]);

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
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Interest</Label>
          <Select value={localInterest} onValueChange={setLocalInterest}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="— none —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— none —</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Notes</Label>
          <Textarea
            value={localNotes}
            onChange={(e) => setLocalNotes(e.target.value)}
            placeholder="Personal notes..."
            className="text-sm min-h-[80px]"
          />
        </div>
        <Button size="sm" className="w-full" onClick={() => { onSave({ notes: localNotes, interestLevel: localInterest }); setOpen(false); }} disabled={isPending}>
          Save
        </Button>
      </PopoverContent>
    </Popover>
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

export default function Home() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [interestLevel, setInterestLevel] = useState<string>("all");
  const [borough, setBorough] = useState<string>("all");
  const [condoType, setCondoType] = useState<string>("all");
  const [parkingInfo, setParkingInfo] = useState<string>("all");
  const [sortBy, setSortBy] = useState("updatedAt");
  const [sortDir, setSortDir] = useState("desc");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<"table" | "card">("table");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const queryParams: GetListingsParams = {
    search: debouncedSearch || undefined,
    status: status !== "all" ? status : undefined,
    interestLevel: interestLevel !== "all" ? interestLevel : undefined,
    sortBy,
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
    return allListings.filter((l) => {
      if (borough !== "all" && l.neighborhood !== borough) return false;
      if (parkingInfo !== "all" && l.parkingInfo !== parkingInfo) return false;
      if (condoType !== "all" && l.propertyType !== condoType) return false;
      return true;
    });
  }, [allListings, borough, parkingInfo, condoType]);

  const checkAll = useCheckAllListings({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "Refresh complete", description: `Checked ${data.checked} listings. Found ${data.totalChanges} changes.` });
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

  const notesProps = (listing: (typeof listings)[0]) => ({
    listingId: listing.id,
    notes: listing.notes,
    interestLevel: listing.interestLevel,
    isPending: updateListing.isPending,
    onSave: (data: { notes: string; interestLevel: string }) =>
      updateListing.mutate({
        id: listing.id,
        data: { notes: data.notes || null, interestLevel: data.interestLevel === "none" ? null : data.interestLevel || null },
      }),
  });

  const boroughOptions = [...new Set((allListings ?? []).map((l) => l.neighborhood).filter(Boolean))];
  const parkingOptions = [...new Set((allListings ?? []).map((l) => l.parkingInfo).filter(Boolean))];

  const EmptyState = () => (
    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
      <MapPin className="w-10 h-10 opacity-30" />
      <p className="text-sm font-medium">No listings found</p>
      {(debouncedSearch || status !== "all" || borough !== "all" || parkingInfo !== "all" || condoType !== "all") && (
        <Button variant="outline" size="sm" onClick={() => { setSearch(""); setStatus("all"); setInterestLevel("all"); setBorough("all"); setParkingInfo("all"); setCondoType("all"); }}>
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
          <div className="flex items-center gap-2 flex-1 w-full md:max-w-sm relative">
            <Search className="w-4 h-4 absolute left-3 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search address, borough, notes…"
              className="pl-9 h-9 bg-background text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-listings"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {selectedIds.size > 0 && (
              <Button variant="destructive" size="sm" onClick={() => bulkDelete.mutate(Array.from(selectedIds))} disabled={bulkDelete.isPending} data-testid="btn-bulk-delete">
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Delete {selectedIds.size}
              </Button>
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

          <Select value={borough} onValueChange={setBorough}>
            <SelectTrigger className="w-[190px] h-7 text-xs" data-testid="filter-borough">
              <SelectValue placeholder="Borough" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Boroughs</SelectItem>
              {boroughOptions.map((item) => (
                <SelectItem key={item as string} value={item as string}>{item}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={parkingInfo} onValueChange={setParkingInfo}>
            <SelectTrigger className="w-[150px] h-7 text-xs" data-testid="filter-parking">
              <SelectValue placeholder="Parking" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Parking</SelectItem>
              {parkingOptions.map((item) => (
                <SelectItem key={item as string} value={item as string}>{item}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={condoType} onValueChange={setCondoType}>
            <SelectTrigger className="w-[160px] h-7 text-xs" data-testid="filter-condo-type">
              <SelectValue placeholder="Condo Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Condo Types</SelectItem>
              <SelectItem value="Divided">Divided</SelectItem>
              <SelectItem value="Undivided">Undivided</SelectItem>
            </SelectContent>
          </Select>

          <Select value={`${sortBy}-${sortDir}`} onValueChange={(v) => { const [by, dir] = v.split("-"); setSortBy(by); setSortDir(dir); }}>
            <SelectTrigger className="w-[170px] h-7 text-xs" data-testid="filter-sort">
              <SelectValue placeholder="Sort By" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updatedAt-desc">Recently Updated</SelectItem>
              <SelectItem value="currentPrice-asc">Price ↑</SelectItem>
              <SelectItem value="currentPrice-desc">Price ↓</SelectItem>
              <SelectItem value="firstSavedAt-desc">Recently Added</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* ── TABLE VIEW ── */}
        {viewMode === "table" && (
          <div className="overflow-x-auto">
            <Table className="text-xs min-w-[1500px]">
              <TableHeader className="bg-muted/30 sticky top-0">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-8 px-2">
                    <Checkbox
                      checked={listings.length > 0 && selectedIds.size === listings.length}
                      onCheckedChange={(checked) => setSelectedIds(checked ? new Set(listings.map((l) => l.id)) : new Set())}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead className="min-w-[220px]">Address</TableHead>
                  <TableHead className="w-28">Price</TableHead>
                  <TableHead className="w-32">Price History</TableHead>
                  <TableHead className="w-28">Specs</TableHead>
                  <TableHead className="w-24">Sqft</TableHead>
                  <TableHead className="w-20">Status</TableHead>
                  <TableHead className="w-28">Type</TableHead>
                  <TableHead className="w-32">Borough</TableHead>
                  <TableHead className="w-20">Interest</TableHead>
                  <TableHead className="w-32">Parking</TableHead>
                  <TableHead className="w-28">Metro</TableHead>
                  <TableHead className="w-24">Fees</TableHead>
                  <TableHead className="w-24">Tax</TableHead>
                  <TableHead className="w-10 text-center">Notes</TableHead>
                  <TableHead className="w-10"></TableHead>
                  <TableHead className="w-28 text-right">Last Checked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingListings ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 17 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : listings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={17}>
                      <EmptyState />
                    </TableCell>
                  </TableRow>
                ) : (
                  listings.map((listing) => {
                    const pc = priceHistoryMap.get(listing.id);
                    const pcd = pc ? parsePriceChange(pc) : null;
                    return (
                      <TableRow key={listing.id} className="group" data-testid={`row-listing-${listing.id}`}>
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

                        {/* Address */}
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-1">
                            <span className="truncate max-w-[200px]" title={listing.address || listing.title || listing.listingUrl}>
                              {listing.address || listing.title || listing.listingUrl}
                            </span>
                            {(listing.address || listing.title) && (
                              <CopyText text={stripBorough(listing.address || listing.title || "")} />
                            )}
                            {listing.listingUrl && (
                              <a href={listing.listingUrl} target="_blank" rel="noopener noreferrer"
                                className="inline-flex text-muted-foreground hover:text-primary transition-colors flex-shrink-0"
                                onClick={(e) => e.stopPropagation()}>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                          {listing.neighborhood && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">{listing.neighborhood}</div>
                          )}
                        </TableCell>

                        {/* Price */}
                        <TableCell>
                          <span className="font-semibold tabular-nums">{fmt(listing.currentPrice)}</span>
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

                        {/* Specs */}
                        <TableCell className="text-muted-foreground">
                          {fmt(listing.bedrooms)} bd · {fmt(listing.bathrooms)} ba
                        </TableCell>

                        {/* Sqft */}
                        <TableCell className="text-muted-foreground tabular-nums">
                          {listing.squareFeet ? `${listing.squareFeet}` : "—"}
                        </TableCell>

                        {/* Status */}
                        <TableCell><StatusBadge status={listing.listingStatus} /></TableCell>

                        {/* Type */}
                        <TableCell className="text-muted-foreground">{fmt(listing.propertyType)}</TableCell>

                        {/* Borough */}
                        <TableCell className="text-muted-foreground">{fmt(listing.neighborhood)}</TableCell>

                        {/* Interest */}
                        <TableCell><InterestBadge level={listing.interestLevel} /></TableCell>

                        {/* Parking */}
                        <TableCell className="text-muted-foreground">{fmt(listing.parkingInfo)}</TableCell>

                        {/* Metro */}
                        <TableCell>
                          {listing.nearestMetro ? (
                            <div className="flex flex-col leading-tight">
                              <span className="font-medium truncate max-w-[110px]">{listing.nearestMetro}</span>
                              <span className="text-[10px] text-muted-foreground">{listing.walkingMinutes} min walk</span>
                            </div>
                          ) : "—"}
                        </TableCell>

                        {/* Condo Fees/mo */}
                        <TableCell className="text-muted-foreground tabular-nums">{fmt(listing.condoFees)}</TableCell>

                        {/* Tax/mo */}
                        <TableCell className="text-muted-foreground tabular-nums">{toMonthly(listing.taxes)}</TableCell>

                        {/* Notes */}
                        <TableCell className="text-center">
                          <NotesPopover {...notesProps(listing)} />
                        </TableCell>

                        {/* Delete */}
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => { e.stopPropagation(); deleteListing.mutate({ id: listing.id }); }}
                            data-testid={`btn-delete-${listing.id}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </TableCell>

                        {/* Last checked */}
                        <TableCell className="text-right text-muted-foreground tabular-nums">
                          {timeAgo(listing.updatedAt)}
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
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {listings.map((listing) => {
                  const pc = priceHistoryMap.get(listing.id);
                  const pcd = pc ? parsePriceChange(pc) : null;
                  const isSelected = selectedIds.has(listing.id);

                  return (
                    <div
                      key={listing.id}
                      className={`group relative flex flex-col rounded-xl border bg-card transition-all duration-200 hover:border-primary/40 hover:shadow-lg ${isSelected ? "border-primary/60 shadow-md" : "border-border"}`}
                      data-testid={`card-listing-${listing.id}`}
                    >
                      {/* Card top actions */}
                      <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
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

                      {/* Card body */}
                      <div className="p-5 flex flex-col gap-4 flex-1">

                        {/* Header: address + status */}
                        <div className="flex items-start justify-between gap-2 pr-8">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-semibold text-sm leading-snug truncate" title={listing.address || listing.title || listing.listingUrl}>
                                {listing.address || listing.title || listing.listingUrl}
                              </p>
                              {(listing.address || listing.title) && (
                                <CopyText text={stripBorough(listing.address || listing.title || "")} />
                              )}
                              {listing.listingUrl && (
                                <a href={listing.listingUrl} target="_blank" rel="noopener noreferrer"
                                  className="text-muted-foreground hover:text-primary transition-colors flex-shrink-0">
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                            {listing.neighborhood && (
                              <p className="text-xs text-muted-foreground mt-0.5">{listing.neighborhood}</p>
                            )}
                          </div>
                          <StatusBadge status={listing.listingStatus} />
                        </div>

                        {/* Price */}
                        <div className="flex items-end gap-3">
                          <span className="text-2xl font-bold tabular-nums tracking-tight">
                            {listing.currentPrice || "—"}
                          </span>
                          {pcd && (
                            <span className={`flex items-center gap-0.5 text-sm font-medium pb-0.5 ${pcd.isDown ? "text-emerald-400" : "text-red-400"}`}>
                              {pcd.isDown ? <ArrowDown className="w-3.5 h-3.5" /> : <ArrowUp className="w-3.5 h-3.5" />}
                              {pcd.label}
                              <span className="text-muted-foreground font-normal text-xs ml-0.5">· {pcd.date}</span>
                            </span>
                          )}
                        </div>

                        {/* Specs row */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {listing.bedrooms && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-muted/50 px-2 py-1 text-xs font-medium">
                              {listing.bedrooms} <span className="text-muted-foreground">bd</span>
                            </span>
                          )}
                          {listing.bathrooms && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-muted/50 px-2 py-1 text-xs font-medium">
                              {listing.bathrooms} <span className="text-muted-foreground">ba</span>
                            </span>
                          )}
                          {listing.squareFeet && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-muted/50 px-2 py-1 text-xs font-medium tabular-nums">
                              {listing.squareFeet} <span className="text-muted-foreground">ft²</span>
                            </span>
                          )}
                          {listing.propertyType && (
                            <span className="inline-flex items-center rounded-md bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
                              {listing.propertyType}
                            </span>
                          )}
                          <InterestBadge level={listing.interestLevel} />
                        </div>

                        {/* Metro */}
                        {listing.nearestMetro && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Train className="w-3.5 h-3.5 flex-shrink-0 text-primary/70" />
                            <span className="font-medium text-foreground/80">{listing.nearestMetro}</span>
                            <span>· {listing.walkingMinutes} min walk</span>
                          </div>
                        )}

                        {/* Financials */}
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <div className="rounded-lg bg-muted/30 px-3 py-2">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-0.5">Condo Fees</p>
                            <p className="text-sm font-semibold tabular-nums">{fmt(listing.condoFees)}</p>
                          </div>
                          <div className="rounded-lg bg-muted/30 px-3 py-2">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-0.5">Tax / mo</p>
                            <p className="text-sm font-semibold tabular-nums">{toMonthly(listing.taxes)}</p>
                          </div>
                        </div>
                      </div>

                      {/* Card footer */}
                      <div className="px-5 py-3 border-t border-border/60 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          {listing.parkingInfo && (
                            <span className="bg-muted/40 rounded px-1.5 py-0.5">{listing.parkingInfo}</span>
                          )}
                          {listing.updatedAt && (
                            <span>{timeAgo(listing.updatedAt)}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5">
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
            )}
          </div>
        )}
      </div>
    </div>
  );
}
