import React, { useState, useCallback } from "react";
import { Link } from "wouter";
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
  FileText,
  Trash2,
  Copy,
  Check,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      title="Copy address"
    >
      {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
      <span className="truncate max-w-[220px]">{address}</span>
    </button>
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

  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();

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
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetListingsQueryKey() });
      }
    }
  });

  const deleteListing = useDeleteListing({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetListingsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        toast({ title: "Listing deleted" });
      },
      onError: () => {
        toast({ title: "Failed to delete listing", variant: "destructive" });
      }
    }
  });

  const bulkDelete = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await fetch("/listings/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error("Bulk delete failed");
      return res.json();
    },
    onSuccess: (data: { deleted: number }) => {
      queryClient.invalidateQueries({ queryKey: getGetListingsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      setSelectedIds(new Set());
      toast({ title: `Deleted ${data.deleted} listing${data.deleted !== 1 ? "s" : ""}` });
    },
    onError: () => {
      toast({ title: "Bulk delete failed", variant: "destructive" });
    }
  });

  const allIds = listings?.map((l) => l.id) ?? [];
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  }, [allSelected, allIds]);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div className="flex-1 p-6 container mx-auto space-y-6">
      <div className="bg-card border rounded-lg overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="p-4 border-b flex flex-col md:flex-row gap-4 items-start md:items-center justify-between bg-muted/20">
          <div className="flex items-center gap-2 flex-1 w-full md:max-w-md relative">
            <Search className="w-4 h-4 absolute left-3 text-muted-foreground" />
            <Input 
              placeholder="Search address, city, or MLS..." 
              className="pl-9 bg-background"
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
                <Trash2 className="w-4 h-4 mr-2" />
                Delete {selectedIds.size} selected
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
              <RefreshCw className={`w-4 h-4 mr-2 ${checkAll.isPending ? "animate-spin" : ""}`} />
              Check All
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="p-4 border-b flex flex-wrap gap-4 items-center bg-muted/10 text-sm">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[140px] h-8" data-testid="filter-status">
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
            <SelectTrigger className="w-[140px] h-8" data-testid="filter-interest">
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
            <SelectTrigger className="w-[180px] h-8" data-testid="filter-sort">
              <SelectValue placeholder="Sort By" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updatedAt-desc">Recently Updated</SelectItem>
              <SelectItem value="currentPrice-asc">Price (Low to High)</SelectItem>
              <SelectItem value="currentPrice-desc">Price (High to Low)</SelectItem>
              <SelectItem value="firstSavedAt-desc">Recently Added</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center space-x-2 ml-2 border-l pl-4 border-border">
            <Switch 
              id="price-drop" 
              checked={hasPriceDrop} 
              onCheckedChange={setHasPriceDrop} 
              data-testid="toggle-price-drop"
            />
            <Label htmlFor="price-drop" className="cursor-pointer">Price Drop</Label>
          </div>
          
          <div className="flex items-center space-x-2 ml-2">
            <Switch 
              id="archived" 
              checked={showArchived} 
              onCheckedChange={setShowArchived} 
              data-testid="toggle-archived"
            />
            <Label htmlFor="archived" className="cursor-pointer">Show Hidden</Label>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto relative min-h-[400px]">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0">
              <TableRow>
                <TableHead className="w-10 text-center">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                    data-testid="checkbox-select-all"
                  />
                </TableHead>
                <TableHead className="w-8"></TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Specs</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Interest</TableHead>
                <TableHead className="text-right">Last Checked</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingListings ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-6" /></TableCell>
                  </TableRow>
                ))
              ) : listings?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-48 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <MapPin className="w-8 h-8 text-muted" />
                      <p>No listings found matching your criteria.</p>
                      {debouncedSearch || status !== "all" ? (
                        <Button variant="link" onClick={() => {
                          setSearch("");
                          setStatus("all");
                          setInterestLevel("all");
                          setHasPriceDrop(false);
                          setShowArchived(false);
                        }}>Clear Filters</Button>
                      ) : (
                        <p className="text-sm">Click "Add Listing" to start tracking.</p>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                listings?.map((listing) => (
                  <TableRow key={listing.id} className={`group ${listing.hidden ? 'opacity-50' : ''}`} data-testid={`row-listing-${listing.id}`}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(listing.id)}
                        onCheckedChange={() => toggleSelect(listing.id)}
                        aria-label={`Select listing ${listing.id}`}
                        data-testid={`checkbox-listing-${listing.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-muted-foreground hover:text-yellow-500 data-[favorite=true]:text-yellow-500"
                        data-favorite={listing.favorite}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleFavorite.mutate({ id: listing.id, data: { favorite: !listing.favorite } });
                        }}
                        data-testid={`btn-favorite-${listing.id}`}
                      >
                        <Star className={`w-4 h-4 ${listing.favorite ? 'fill-current' : ''}`} />
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <Link href={`/listings/${listing.id}`} className="font-semibold hover:underline text-primary truncate max-w-[280px]" data-testid={`link-listing-${listing.id}`}>
                          {listing.title || listing.address || "Unknown Property"}
                        </Link>
                        {listing.address && (
                          <CopyAddress address={listing.address} />
                        )}
                        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                          {listing.neighborhood && <span>{listing.neighborhood}</span>}
                          {listing.notes && <FileText className="w-3 h-3 text-muted-foreground" />}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-mono font-bold">{listing.currentPrice || "---"}</span>
                        {listing.priceDelta && (
                          <div className={`text-xs flex items-center mt-0.5 ${listing.priceDelta.startsWith('-') ? 'text-green-500' : 'text-red-500'}`}>
                            {listing.priceDelta.startsWith('-') ? <ArrowDown className="w-3 h-3 mr-0.5" /> : <ArrowUp className="w-3 h-3 mr-0.5" />}
                            {listing.priceDelta}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm flex flex-col gap-0.5 text-muted-foreground">
                        <div className="flex gap-3">
                          <span title="Bedrooms">{listing.bedrooms || "-"} bd</span>
                          <span title="Bathrooms">{listing.bathrooms || "-"} ba</span>
                          {listing.squareFeet && <span title="Square Feet">{listing.squareFeet} sqft</span>}
                        </div>
                        {listing.daysOnMarket && (
                          <span className="text-xs text-muted-foreground">{listing.daysOnMarket} days on market</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={listing.listingStatus} />
                    </TableCell>
                    <TableCell>
                      {listing.interestLevel && (
                        <Badge variant="outline" className={`
                          ${listing.interestLevel === 'high' ? 'border-primary text-primary' : ''}
                          ${listing.interestLevel === 'medium' ? 'border-blue-500 text-blue-500' : ''}
                          ${listing.interestLevel === 'low' ? 'border-muted-foreground text-muted-foreground' : ''}
                        `}>
                          {listing.interestLevel.toUpperCase()}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                      {listing.lastCheckedAt ? (
                        <div className="flex items-center justify-end gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDistanceToNow(new Date(listing.lastCheckedAt), { addSuffix: true })}
                        </div>
                      ) : "Never"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          deleteListing.mutate({ id: listing.id });
                        }}
                        disabled={deleteListing.isPending}
                        data-testid={`btn-delete-${listing.id}`}
                        title="Delete listing"
                      >
                        <Trash2 className="w-4 h-4" />
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
