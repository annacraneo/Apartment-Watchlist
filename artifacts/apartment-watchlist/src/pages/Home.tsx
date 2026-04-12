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
  MapPin,
  ArrowDown,
  ArrowUp,
  Trash2,
  Copy,
  Check,
  StickyNote,
  ExternalLink,
  Clock3,
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

  const handleSave = () => {
    onSave({ notes: localNotes, interestLevel: localInterest });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground"
          title="View notes"
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
  const [borough, setBorough] = useState<string>("all");
  const [condoType, setCondoType] = useState<string>("all");
  const [parkingInfo, setParkingInfo] = useState<string>("all");
  const [sortBy, setSortBy] = useState("updatedAt");
  const [sortDir, setSortDir] = useState("desc");

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
              <SelectItem value="active">ACTIVE</SelectItem>
              <SelectItem value="inactive">INACTIVE</SelectItem>
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
              {[...new Set((listings ?? []).map((l) => l.neighborhood).filter(Boolean))].map((item) => (
                <SelectItem key={item as string} value={item as string}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={parkingInfo} onValueChange={setParkingInfo}>
            <SelectTrigger className="w-[150px] h-7 text-xs" data-testid="filter-parking">
              <SelectValue placeholder="Parking" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Parking</SelectItem>
              {[...new Set((listings ?? []).map((l) => l.parkingInfo).filter(Boolean))].map((item) => (
                <SelectItem key={item as string} value={item as string}>
                  {item}
                </SelectItem>
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

        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <Table className="text-xs min-w-[1400px]">
            <TableHeader className="bg-muted/50 sticky top-0">
              <TableRow>
                <TableHead className="min-w-[200px]">Address</TableHead>
                <TableHead className="w-24">Price</TableHead>
                <TableHead className="w-28">Specs</TableHead>
                <TableHead className="w-24">Sqft</TableHead>
                <TableHead className="w-20">Status</TableHead>
                <TableHead className="w-28">Condo Type</TableHead>
                <TableHead className="w-32">Borough</TableHead>
                <TableHead className="w-20">Interest</TableHead>
                <TableHead className="w-32">Parking</TableHead>
                <TableHead className="w-24">Condo Fees</TableHead>
                <TableHead className="w-24">Taxes</TableHead>
                <TableHead className="w-16 text-center">Notes</TableHead>
                <TableHead className="w-10"></TableHead>
                <TableHead className="w-28 text-right">Last Checked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingListings ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 12 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : listings?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="h-40 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <MapPin className="w-8 h-8 text-muted" />
                      <p>No listings found.</p>
                      {(debouncedSearch || status !== "all" || borough !== "all" || parkingInfo !== "all" || condoType !== "all") && (
                        <Button variant="link" size="sm" onClick={() => {
                          setSearch(""); setStatus("all"); setInterestLevel("all");
                          setBorough("all"); setParkingInfo("all"); setCondoType("all");
                        }}>Clear Filters</Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                listings?.map((listing) => (
                  <TableRow
                    key={listing.id}
                    className="group"
                    data-testid={`row-listing-${listing.id}`}
                  >
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
                        {listing.priceDelta && listing.priceDelta !== "0.00" && listing.priceDelta !== "$0.00" && listing.priceDelta !== "0" && listing.priceDelta !== "+0.00" && listing.priceDelta !== "-0.00" && (
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

                    {/* Borough */}
                    <TableCell className="text-muted-foreground">{fmt(listing.neighborhood)}</TableCell>

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

                    {/* Parking */}
                    <TableCell className="text-muted-foreground">{fmt(listing.parkingInfo)}</TableCell>

                    {/* Condo Fees */}
                    <TableCell className="text-muted-foreground">{fmt(listing.condoFees)}</TableCell>

                    {/* Taxes */}
                    <TableCell className="text-muted-foreground">{fmt(listing.taxes)}</TableCell>

                    {/* Notes */}
                    <TableCell className="text-center">
                      <NotesPopover
                        listingId={listing.id}
                        notes={listing.notes}
                        interestLevel={listing.interestLevel}
                        isPending={updateListing.isPending}
                        onSave={(data) => updateListing.mutate({
                          id: listing.id,
                          data: {
                            notes: data.notes || null,
                            interestLevel: data.interestLevel === "none" ? null : data.interestLevel || null,
                          }
                        })}
                      />
                    </TableCell>

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

                    {/* Last Checked */}
                    <TableCell className="text-right text-muted-foreground whitespace-nowrap">
                      {listing.lastCheckedAt ? (
                        <span className="flex items-center justify-end gap-1">
                          <Clock3 className="w-3 h-3" />
                          {formatDistanceToNow(new Date(listing.lastCheckedAt), { addSuffix: true })}
                        </span>
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
