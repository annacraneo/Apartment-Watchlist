import React, { useState } from "react";
import { Link } from "wouter";
import { 
  useGetListings, 
  useGetDashboardSummary,
  useCheckAllListings,
  useUpdateListing,
  getGetListingsQueryKey,
  getGetDashboardSummaryQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  Search, 
  RefreshCw, 
  Star, 
  Clock, 
  MapPin,
  ArrowDown,
  ArrowUp,
  FileText
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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

export default function Home() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [interestLevel, setInterestLevel] = useState<string>("all");
  const [source, setSource] = useState<string>("all");
  const [hasPriceDrop, setHasPriceDrop] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [sortBy, setSortBy] = useState("updatedAt");
  const [sortDir, setSortDir] = useState("desc");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();

  const queryParams: any = {
    search: debouncedSearch || undefined,
    status: status !== "all" ? status : undefined,
    interestLevel: interestLevel !== "all" ? interestLevel : undefined,
    source: source !== "all" ? source : undefined,
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

  return (
    <div className="flex-1 p-6 container mx-auto space-y-6">
      {/* Dashboard Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border rounded-lg p-4 flex flex-col items-start" data-testid="stat-card-total">
          <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">Tracking</span>
          {isLoadingSummary ? <Skeleton className="h-8 w-16 mt-2" /> : <span className="text-3xl font-bold mt-1 text-foreground">{summary?.totalListings || 0}</span>}
        </div>
        <div className="bg-card border rounded-lg p-4 flex flex-col items-start" data-testid="stat-card-active">
          <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">Active</span>
          {isLoadingSummary ? <Skeleton className="h-8 w-16 mt-2" /> : <span className="text-3xl font-bold mt-1 text-primary">{summary?.activeListings || 0}</span>}
        </div>
        <div className="bg-card border rounded-lg p-4 flex flex-col items-start" data-testid="stat-card-drops">
          <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">Price Drops Today</span>
          {isLoadingSummary ? <Skeleton className="h-8 w-16 mt-2" /> : <span className="text-3xl font-bold mt-1 text-green-500">{summary?.priceDropsToday || 0}</span>}
        </div>
        <div className="bg-card border rounded-lg p-4 flex flex-col items-start" data-testid="stat-card-status">
          <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">Status Changes</span>
          {isLoadingSummary ? <Skeleton className="h-8 w-16 mt-2" /> : <span className="text-3xl font-bold mt-1 text-yellow-500">{summary?.statusChangesToday || 0}</span>}
        </div>
      </div>

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
            <AddListingDialog />
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => checkAll.mutate({})} 
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

          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="w-[140px] h-8" data-testid="filter-source">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="centris">Centris</SelectItem>
              <SelectItem value="realtor">Realtor.ca</SelectItem>
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
                <TableHead className="w-10 text-center"></TableHead>
                <TableHead className="w-16"></TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Specs</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Interest</TableHead>
                <TableHead className="text-right">Last Checked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingListings ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                    <TableCell><Skeleton className="h-10 w-16 rounded" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : listings?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-48 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <MapPin className="w-8 h-8 text-muted" />
                      <p>No listings found matching your criteria.</p>
                      {debouncedSearch || status !== "all" ? (
                        <Button variant="link" onClick={() => {
                          setSearch("");
                          setStatus("all");
                          setInterestLevel("all");
                          setSource("all");
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
                      <div className="w-16 h-12 bg-muted rounded overflow-hidden border">
                        {listing.mainImageUrl ? (
                          <img src={listing.mainImageUrl} alt="Thumbnail" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">No img</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <Link href={`/listings/${listing.id}`} className="font-semibold hover:underline text-primary truncate max-w-[250px]" data-testid={`link-listing-${listing.id}`}>
                          {listing.title || listing.address || "Unknown Property"}
                        </Link>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                          {listing.neighborhood && <span>{listing.neighborhood}</span>}
                          {listing.sourceSite && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">{listing.sourceSite}</Badge>
                          )}
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
                      <div className="text-sm flex gap-3 text-muted-foreground">
                        <span title="Bedrooms">{listing.bedrooms || "-"} bd</span>
                        <span title="Bathrooms">{listing.bathrooms || "-"} ba</span>
                        {listing.squareFeet && <span title="Square Feet">{listing.squareFeet} sqft</span>}
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
