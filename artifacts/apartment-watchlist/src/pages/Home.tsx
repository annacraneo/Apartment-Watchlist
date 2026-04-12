import React, { useState, useCallback } from "react";
import { 
  useGetListings, 
  useGetDashboardSummary,
  useCheckAllListings,
  useUpdateListing,
  useDeleteListing,
  getGetListingsQueryKey,
  getGetDashboardSummaryQueryKey,
  type GetListingsParams
} from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Search, 
  RefreshCw, 
  Star, 
  Clock, 
  MapPin,
  ArrowDown,
  ArrowUp,
  Trash2,
  Copy,
  Check,
  Pencil,
  ExternalLink,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

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
  SelectValue 
} from "@/components/ui/select";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

import { AddListingDialog } from "@/components/AddListingDialog";
import { StatusBadge } from "@/components/StatusBadge";

function CopyText({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={handleCopy}
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
  tags: string | null | undefined;
  interestLevel: string | null | undefined;
  onSave: (data: { notes: string; tags: string; interestLevel: string }) => void;
  isPending: boolean;
}

function NotesPopover({ listingId, notes, tags, interestLevel, onSave, isPending }: NotesPopoverProps) {
  const [open, setOpen] = useState(false);
  const [localNotes, setLocalNotes] = useState(notes || "");
  const [localTags, setLocalTags] = useState(tags || "");
  const [localInterest, setLocalInterest] = useState(interestLevel || "");

  React.useEffect(() => {
    if (open) {
      setLocalNotes(notes || "");
      setLocalTags(tags || "");
      setLocalInterest(interestLevel || "");
    }
  }, [open, notes, tags, interestLevel]);

  const handleSave = () => {
    onSave({ notes: localNotes, tags: localTags, interestLevel: localInterest });
    setOpen(false);
  };

  const hasContent = notes || tags || interestLevel;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`h-7 w-7 ${hasContent ? "text-primary" : "text-muted-foreground"}`}
          title="Edit notes, tags & interest"
          data-testid={`btn-notes-${listingId}`}
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4 space-y-3" align="end">
        <p className="text-sm font-semibold">Notes & Tags</p>
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
          <Label className="text-xs text-muted-foreground">Tags (comma-separated)</Label>
          <Input
            value={localTags}
            onChange={(e) => setLocalTags(e.target.value)}
            placeholder="e.g. big kitchen, needs work"
            className="h-8 text-sm"
          />
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
        <Button size="sm" className="w-full" onClick={handleSave} disabled={isPending}>
          Save
        </Button>
      </PopoverContent>
    </Popover>
  );
}

export default function Home() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [interestLevel, setInterestLevel] = useState<string>("all");
  const [hasPriceDrop, setHasPriceDrop] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [sortBy, setSortBy] = useState("updatedAt");
  const [sortDir, setSortDir] = useState("desc");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

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
    hasPriceDrop: hasPriceDrop ? "true" : undefined,
    archived: showArchived ? "true" : "false",
    sortBy,
    sortDir,
  };

  const { data: listings, isLoading: isLoadingListings } = useGetListings(queryParams, {
    query: {
      queryKey: getGetListingsQueryKey(queryParams),
      refetchInterval: 60000,
    }
  });

  const checkAll = useCheckAllListings({
    mutation: {
      onSuccess: (data) => {
        toast({ 
          title: "Refresh complete", 
          description: `Checked ${data.checked} listings. Found ${data.totalChanges} changes.` 
        });
        queryClient.invalidateQueries({ queryKey: getGetListingsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      }
    }
  });

  const toggleFavorite = useUpdateListing({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetListingsQueryKey() }),
    }
  });

  const updateListing = useUpdateListing({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetListingsQueryKey() }),
      onError: () => toast({ title: "Failed to save", variant: "destructive" }),
    }
  });

  const deleteListing = useDeleteListing({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetListingsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        toast({ title: "Listing deleted" });
      },
      onError: () => toast({ title: "Failed to delete listing", variant: "destructive" }),
    }
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

  const allIds = listings?.map((l) => l.id) ?? [];
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(allSelected ? new Set() : new Set(allIds));
  }, [allSelected, allIds]);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const fmt = (val: string | null | undefined, suffix = "") =>
    val ? `${val}${suffix}` : "—";

  return (
    <div className="flex-1 p-4 container mx-auto space-y-4">
      <div className="bg-card border rounded-lg overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="p-3 border-b flex flex-col md:flex-row gap-3 items-start md:items-center justify-between bg-muted/20">
          <div className="flex items-center gap-2 flex-1 w-full md:max-w-sm relative">
            <Search className="w-4 h-4 absolute left-3 text-muted-foreground" />
            <Input 
              placeholder="Search address, city, or MLS..." 
              className="pl-9 bg-background h-8 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-listings"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {someSelected && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => bulkDelete.mutate(Array.from(selectedIds))}
                disabled={bulkDelete.isPending}
                data-testid="btn-bulk-delete"
              >
                <Trash2 className="w-4 h-4 mr-1.5" />
                Delete {selectedIds.size}
              </Button>
            )}
            <AddListingDialog />
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => checkAll.mutate()} 
              disabled={checkAll.isPending}
              data-testid="btn-check-all"
            >
              <RefreshCw className={`w-4 h-4 mr-1.5 ${checkAll.isPending ? "animate-spin" : ""}`} />
              Check All
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="px-3 py-2 border-b flex flex-wrap gap-3 items-center bg-muted/10 text-sm">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[130px] h-7 text-xs" data-testid="filter-status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="sold">Sold</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="unavailable">Unavailable</SelectItem>
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

          <Select value={`${sortBy}-${sortDir}`} onValueChange={(v) => {
            const [by, dir] = v.split("-");
            setSortBy(by);
            setSortDir(dir);
          }}>
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

          <div className="flex items-center gap-1.5 border-l pl-3 border-border">
            <Switch id="price-drop" checked={hasPriceDrop} onCheckedChange={setHasPriceDrop} data-testid="toggle-price-drop" />
            <Label htmlFor="price-drop" className="text-xs cursor-pointer">Price Drop</Label>
          </div>
          <div className="flex items-center gap-1.5">
            <Switch id="archived" checked={showArchived} onCheckedChange={setShowArchived} data-testid="toggle-archived" />
            <Label htmlFor="archived" className="text-xs cursor-pointer">Show Hidden</Label>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <Table className="text-xs min-w-[1400px]">
            <TableHeader className="bg-muted/50 sticky top-0">
              <TableRow>
                <TableHead className="w-8 px-2">
                  <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} aria-label="Select all" />
                </TableHead>
                <TableHead className="w-7 px-1"></TableHead>
                <TableHead className="min-w-[200px]">Address</TableHead>
                <TableHead className="w-24">Price</TableHead>
                <TableHead className="w-28">Specs</TableHead>
                <TableHead className="w-24">Sqft</TableHead>
                <TableHead className="w-20">Status</TableHead>
                <TableHead className="w-28">Condo Type</TableHead>
                <TableHead className="w-32">Neighborhood</TableHead>
                <TableHead className="w-20">Year Built</TableHead>
                <TableHead className="w-16">DOM</TableHead>
                <TableHead className="w-32">Parking</TableHead>
                <TableHead className="w-24">Condo Fees</TableHead>
                <TableHead className="w-24">Taxes</TableHead>
                <TableHead className="w-20">Interest</TableHead>
                <TableHead className="w-28 text-right">Last Checked</TableHead>
                <TableHead className="w-44">Notes / Tags</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingListings ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 16 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : listings?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={16} className="h-40 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <MapPin className="w-8 h-8 text-muted" />
                      <p>No listings found.</p>
                      {(debouncedSearch || status !== "all") && (
                        <Button variant="link" size="sm" onClick={() => {
                          setSearch(""); setStatus("all"); setInterestLevel("all");
                          setHasPriceDrop(false); setShowArchived(false);
                        }}>Clear Filters</Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                listings?.map((listing) => (
                  <TableRow
                    key={listing.id}
                    className={`group ${listing.hidden ? "opacity-50" : ""}`}
                    data-testid={`row-listing-${listing.id}`}
                  >
                    {/* Checkbox */}
                    <TableCell className="px-2">
                      <Checkbox
                        checked={selectedIds.has(listing.id)}
                        onCheckedChange={() => toggleSelect(listing.id)}
                        aria-label={`Select ${listing.id}`}
                      />
                    </TableCell>

                    {/* Favorite */}
                    <TableCell className="px-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-yellow-500"
                        data-favorite={listing.favorite}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite.mutate({ id: listing.id, data: { favorite: !listing.favorite } });
                        }}
                        data-testid={`btn-favorite-${listing.id}`}
                      >
                        <Star className={`w-3.5 h-3.5 ${listing.favorite ? "fill-yellow-500 text-yellow-500" : ""}`} />
                      </Button>
                    </TableCell>

                    {/* Address */}
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1">
                        <span className="truncate max-w-[200px]" title={listing.address || listing.title || listing.listingUrl}>
                          {listing.address || listing.title || listing.listingUrl}
                        </span>
                        {(listing.address || listing.title) && (
                          <CopyText text={listing.address || listing.title || ""} />
                        )}
                        {listing.listingUrl && (
                          <a
                            href={listing.listingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex text-muted-foreground hover:text-primary transition-colors flex-shrink-0"
                            title="Open original listing"
                            onClick={(e) => e.stopPropagation()}
                          >
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
                      <div className="flex flex-col">
                        <span className="font-mono font-semibold">{listing.currentPrice || "—"}</span>
                        {listing.priceDelta && (
                          <span className={`text-[10px] flex items-center ${listing.priceDelta.startsWith("-") ? "text-green-500" : "text-red-500"}`}>
                            {listing.priceDelta.startsWith("-") ? <ArrowDown className="w-2.5 h-2.5 mr-0.5" /> : <ArrowUp className="w-2.5 h-2.5 mr-0.5" />}
                            {listing.priceDelta}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* Specs */}
                    <TableCell className="text-muted-foreground">
                      <span>{listing.bedrooms || "—"} bd</span>
                      <span className="mx-1">·</span>
                      <span>{listing.bathrooms || "—"} ba</span>
                    </TableCell>

                    {/* Sqft */}
                    <TableCell className="text-muted-foreground">
                      {listing.squareFeet ? `${listing.squareFeet} sqft` : "—"}
                    </TableCell>

                    {/* Status */}
                    <TableCell>
                      <StatusBadge status={listing.listingStatus} />
                    </TableCell>

                    {/* Condo Type */}
                    <TableCell className="text-muted-foreground">{fmt(listing.propertyType)}</TableCell>

                    {/* Neighborhood */}
                    <TableCell className="text-muted-foreground">{fmt(listing.neighborhood)}</TableCell>

                    {/* Year Built */}
                    <TableCell className="text-muted-foreground">{fmt(listing.yearBuilt)}</TableCell>

                    {/* DOM */}
                    <TableCell className="text-muted-foreground">
                      {listing.daysOnMarket ? `${listing.daysOnMarket}d` : "—"}
                    </TableCell>

                    {/* Parking */}
                    <TableCell className="text-muted-foreground">{fmt(listing.parkingInfo)}</TableCell>

                    {/* Condo Fees */}
                    <TableCell className="text-muted-foreground">{fmt(listing.condoFees)}</TableCell>

                    {/* Taxes */}
                    <TableCell className="text-muted-foreground">{fmt(listing.taxes)}</TableCell>

                    {/* Interest */}
                    <TableCell>
                      {listing.interestLevel && listing.interestLevel !== "none" ? (
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4
                          ${listing.interestLevel === "high" ? "border-primary text-primary" : ""}
                          ${listing.interestLevel === "medium" ? "border-blue-500 text-blue-500" : ""}
                          ${listing.interestLevel === "low" ? "border-muted-foreground text-muted-foreground" : ""}
                        `}>
                          {listing.interestLevel.toUpperCase()}
                        </Badge>
                      ) : "—"}
                    </TableCell>

                    {/* Last Checked */}
                    <TableCell className="text-right text-muted-foreground whitespace-nowrap">
                      {listing.lastCheckedAt ? (
                        <span className="flex items-center justify-end gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDistanceToNow(new Date(listing.lastCheckedAt), { addSuffix: true })}
                        </span>
                      ) : "Never"}
                    </TableCell>

                    {/* Notes popup */}
                    <TableCell>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="min-w-0 flex-1">
                          {listing.notes && (
                            <p className="text-[10px] text-muted-foreground truncate max-w-[120px]" title={listing.notes}>
                              {listing.notes}
                            </p>
                          )}
                          {listing.tags && (
                            <p className="text-[10px] text-muted-foreground truncate max-w-[120px]" title={listing.tags}>
                              #{listing.tags.split(",").map(t => t.trim()).join(" #")}
                            </p>
                          )}
                          {!listing.notes && !listing.tags && (
                            <span className="text-[10px] text-muted-foreground/40 italic">Add notes...</span>
                          )}
                        </div>
                        <NotesPopover
                          listingId={listing.id}
                          notes={listing.notes}
                          tags={listing.tags}
                          interestLevel={listing.interestLevel}
                          isPending={updateListing.isPending}
                          onSave={(data) => updateListing.mutate({
                            id: listing.id,
                            data: {
                              notes: data.notes || null,
                              tags: data.tags || null,
                              interestLevel: data.interestLevel === "none" ? null : data.interestLevel || null,
                            }
                          })}
                        />
                      </div>
                    </TableCell>

                    {/* Delete */}
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteListing.mutate({ id: listing.id });
                        }}
                        disabled={deleteListing.isPending}
                        data-testid={`btn-delete-${listing.id}`}
                        title="Delete listing"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
