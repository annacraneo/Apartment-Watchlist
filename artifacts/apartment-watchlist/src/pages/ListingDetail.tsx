import React from "react";
import { Link, useParams, useLocation } from "wouter";
import { 
  useGetListing, 
  useGetListingChanges, 
  useGetListingSnapshots,
  useCheckListing,
  useUpdateListing,
  useDeleteListing,
  getGetListingQueryKey,
  getGetListingChangesQueryKey,
  getGetListingSnapshotsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import { 
  ExternalLink, 
  RefreshCw, 
  ArrowLeft, 
  MapPin, 
  Building, 
  DollarSign, 
  Calendar, 
  FileText,
  Trash2,
  EyeOff,
  Eye,
  Star
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge } from "@/components/StatusBadge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";


export default function ListingDetail() {
  const params = useParams();
  const id = Number(params.id);
  const [_, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: listing, isLoading } = useGetListing(id, {
    query: { enabled: !!id, queryKey: getGetListingQueryKey(id) }
  });
  
  const { data: changes } = useGetListingChanges(id, {
    query: { enabled: !!id, queryKey: getGetListingChangesQueryKey(id) }
  });
  
  const { data: snapshots } = useGetListingSnapshots(id, {
    query: { enabled: !!id, queryKey: getGetListingSnapshotsQueryKey(id) }
  });

  const checkListing = useCheckListing({
    mutation: {
      onSuccess: (data) => {
        toast({ 
          title: "Checked listing", 
          description: data.changesDetected > 0 ? `Found ${data.changesDetected} changes.` : "No changes detected."
        });
        queryClient.invalidateQueries({ queryKey: getGetListingQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetListingChangesQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetListingSnapshotsQueryKey(id) });
      },
      onError: (err) => {
        toast({ title: "Check failed", description: err.message || "Unknown error", variant: "destructive" });
      }
    }
  });

  const updateListing = useUpdateListing({
    mutation: {
      onSuccess: () => {
        toast({ title: "Updated successfully" });
        queryClient.invalidateQueries({ queryKey: getGetListingQueryKey(id) });
      }
    }
  });

  const deleteListing = useDeleteListing({
    mutation: {
      onSuccess: () => {
        toast({ title: "Listing deleted" });
        navigate("/");
      }
    }
  });

  // Local state for auto-save fields
  const [notes, setNotes] = React.useState("");
  const [tags, setTags] = React.useState("");
  const [debouncedNotes, setDebouncedNotes] = React.useState("");
  const [debouncedTags, setDebouncedTags] = React.useState("");
  const initializedId = React.useRef<number | null>(null);
  const lastSaved = React.useRef({ notes: "", tags: "" });

  React.useEffect(() => {
    if (listing && initializedId.current !== id) {
      initializedId.current = id;
      setNotes(listing.notes || "");
      setTags(listing.tags || "");
      lastSaved.current = { notes: listing.notes || "", tags: listing.tags || "" };
    }
  }, [listing, id]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedNotes(notes);
      setDebouncedTags(tags);
    }, 1000);
    return () => clearTimeout(timer);
  }, [notes, tags]);

  const updateMutateRef = React.useRef(updateListing.mutate);
  updateMutateRef.current = updateListing.mutate;

  React.useEffect(() => {
    if (initializedId.current !== id) return;
    if (debouncedNotes !== lastSaved.current.notes || debouncedTags !== lastSaved.current.tags) {
      updateMutateRef.current({ 
        id, 
        data: { notes: debouncedNotes, tags: debouncedTags } 
      });
      lastSaved.current = { notes: debouncedNotes, tags: debouncedTags };
    }
  }, [debouncedNotes, debouncedTags, id]);


  if (isLoading) {
    return <div className="p-6 container mx-auto space-y-6"><Skeleton className="h-64 w-full" /></div>;
  }

  if (!listing) {
    return <div className="p-6 text-center">Listing not found.</div>;
  }

  return (
    <div className="flex-1 p-6 container mx-auto space-y-6 pb-20">
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate("/")} className="pl-0" data-testid="btn-back">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Watchlist
        </Button>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            onClick={() => checkListing.mutate({ id })}
            disabled={checkListing.isPending}
            data-testid="btn-check-now"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${checkListing.isPending ? 'animate-spin' : ''}`} />
            Check Now
          </Button>
          <a href={listing.listingUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="default" data-testid="btn-open-original">
              <ExternalLink className="w-4 h-4 mr-2" />
              Open Original
            </Button>
          </a>
        </div>
      </div>

      {/* Hero Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <div className="bg-card border rounded-lg overflow-hidden flex flex-col sm:flex-row h-full">
            <div className="w-full sm:w-2/5 min-h-[250px] bg-muted relative">
              {listing.mainImageUrl ? (
                <img src={listing.mainImageUrl} alt="Main" className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">No image available</div>
              )}
            </div>
            <div className="p-6 flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between mb-2">
                  <h1 className="text-2xl font-bold text-primary break-words pr-4 leading-tight">
                    {listing.title || listing.address || "Unknown Property"}
                  </h1>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-yellow-500 data-[favorite=true]:text-yellow-500 -mt-2 -mr-2"
                    data-favorite={listing.favorite}
                    onClick={() => updateListing.mutate({ id, data: { favorite: !listing.favorite } })}
                    data-testid="btn-hero-favorite"
                  >
                    <Star className={`w-6 h-6 ${listing.favorite ? 'fill-current' : ''}`} />
                  </Button>
                </div>
                
                <div className="flex items-center gap-2 mb-4 text-muted-foreground">
                  <MapPin className="w-4 h-4" />
                  <span>{listing.neighborhood ? `${listing.neighborhood}, ` : ''}{listing.city || ''}</span>
                </div>
                
                <div className="flex items-baseline gap-4 mb-6">
                  <div className="font-mono text-4xl font-bold">{listing.currentPrice || "---"}</div>
                  <StatusBadge status={listing.listingStatus} />
                </div>
                
                <div className="grid grid-cols-3 gap-4 py-4 border-y border-border/50">
                  <div className="flex flex-col">
                    <span className="text-muted-foreground text-xs uppercase tracking-wider">Bedrooms</span>
                    <span className="text-xl font-mono">{listing.bedrooms || "-"}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-muted-foreground text-xs uppercase tracking-wider">Bathrooms</span>
                    <span className="text-xl font-mono">{listing.bathrooms || "-"}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-muted-foreground text-xs uppercase tracking-wider">Square Feet</span>
                    <span className="text-xl font-mono">{listing.squareFeet || "-"}</span>
                  </div>
                </div>
              </div>
              
              <div className="mt-4 text-xs text-muted-foreground flex justify-between items-center">
                <span>Source: {listing.sourceSite || "Manual"} • MLS: {listing.externalListingId || "-"}</span>
                <span>Last checked: {listing.lastCheckedAt ? formatDistanceToNow(new Date(listing.lastCheckedAt), { addSuffix: true }) : "Never"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Personal Settings Card */}
        <div className="md:col-span-1">
          <Card className="h-full flex flex-col border-primary/20">
            <CardHeader className="pb-3 bg-muted/20">
              <CardTitle className="text-lg flex items-center">
                <FileText className="w-5 h-5 mr-2 text-primary" />
                Personal Notes
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col space-y-4 pt-4">
              <div className="space-y-2 flex-1">
                <Label>Notes</Label>
                <Textarea 
                  placeholder="What do you think about this place? (auto-saves)" 
                  className="min-h-[120px] resize-none font-mono text-sm"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  data-testid="input-detail-notes"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Tags</Label>
                <Input 
                  placeholder="e.g. garage, near metro" 
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="font-mono text-sm"
                  data-testid="input-detail-tags"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Interest</Label>
                  <Select 
                    value={listing.interestLevel || "none"} 
                    onValueChange={(val) => updateListing.mutate({ id, data: { interestLevel: val === "none" ? null : val } })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Rating (1-5)</Label>
                  <Input 
                    type="number" 
                    min={1} max={5} 
                    value={listing.personalRating || ""} 
                    onChange={(e) => {
                      const val = e.target.value;
                      updateListing.mutate({ id, data: { personalRating: val ? Number(val) : null } });
                    }}
                    data-testid="input-detail-rating"
                  />
                </div>
              </div>

              <Separator className="my-2" />
              
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Switch 
                    id="hidden" 
                    checked={listing.hidden}
                    onCheckedChange={(checked) => updateListing.mutate({ id, data: { hidden: checked } })}
                    data-testid="toggle-detail-hidden"
                  />
                  <Label htmlFor="hidden" className="cursor-pointer text-muted-foreground flex items-center">
                    {listing.hidden ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                    Hidden (Archive)
                  </Label>
                </div>
                
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="icon" className="h-8 w-8" data-testid="btn-delete-listing">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this listing?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the listing and all its change history.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={() => deleteListing.mutate({ id })}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Tabs defaultValue="details" className="w-full">
        <TabsList className="w-full justify-start bg-muted/20 border-b rounded-none h-12">
          <TabsTrigger value="details" className="data-[state=active]:bg-background data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">Property Details</TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-background data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">History ({changes?.length || 0})</TabsTrigger>
          <TabsTrigger value="snapshots" className="data-[state=active]:bg-background data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">Raw Snapshots</TabsTrigger>
        </TabsList>
        
        <TabsContent value="details" className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-8">
              <section>
                <h3 className="text-lg font-semibold mb-4 border-b pb-2 flex items-center">
                  <Building className="w-5 h-5 mr-2 text-muted-foreground" />
                  Building Details
                </h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <dt className="text-muted-foreground">Property Type</dt>
                  <dd className="font-medium text-right">{listing.propertyType || "-"}</dd>
                  
                  <dt className="text-muted-foreground">Year Built</dt>
                  <dd className="font-medium text-right">{listing.yearBuilt || "-"}</dd>
                  
                  <dt className="text-muted-foreground">Floor</dt>
                  <dd className="font-medium text-right">{listing.floor || "-"}</dd>
                  
                  <dt className="text-muted-foreground">Days on Market</dt>
                  <dd className="font-medium text-right">{listing.daysOnMarket || "-"}</dd>
                </dl>
              </section>
              
              <section>
                <h3 className="text-lg font-semibold mb-4 border-b pb-2 flex items-center">
                  <DollarSign className="w-5 h-5 mr-2 text-muted-foreground" />
                  Financials
                </h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <dt className="text-muted-foreground">Current Price</dt>
                  <dd className="font-mono font-bold text-right text-primary">{listing.currentPrice || "-"}</dd>
                  
                  <dt className="text-muted-foreground">Previous Price</dt>
                  <dd className="font-mono text-right">{listing.previousPrice || "-"}</dd>
                  
                  <dt className="text-muted-foreground">Condo Fees</dt>
                  <dd className="font-mono text-right">{listing.condoFees || "-"}</dd>
                  
                  <dt className="text-muted-foreground">Taxes</dt>
                  <dd className="font-mono text-right">{listing.taxes || "-"}</dd>
                </dl>
              </section>
            </div>
            
            <div className="space-y-8">
              <section>
                <h3 className="text-lg font-semibold mb-4 border-b pb-2">Description</h3>
                <div className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap max-h-[400px] overflow-y-auto pr-4 font-serif">
                  {listing.description || "No description provided."}
                </div>
              </section>

              <section>
                <h3 className="text-lg font-semibold mb-4 border-b pb-2 flex items-center">
                  Broker Info
                </h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <dt className="text-muted-foreground">Broker Name</dt>
                  <dd className="font-medium text-right">{listing.brokerName || "-"}</dd>
                  
                  <dt className="text-muted-foreground">Brokerage</dt>
                  <dd className="font-medium text-right">{listing.brokerage || "-"}</dd>
                </dl>
              </section>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="history" className="pt-6">
          {changes?.length === 0 ? (
            <div className="text-center p-12 border rounded-lg bg-muted/10 text-muted-foreground">
              No changes recorded yet.
            </div>
          ) : (
            <div className="relative border-l-2 border-primary/30 ml-4 space-y-8 pb-8">
              {changes?.map((change) => (
                <div key={change.id} className="relative pl-6">
                  <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-background border-2 border-primary"></div>
                  <div className="flex items-center justify-between mb-1">
                    <Badge variant="outline" className="font-mono uppercase text-[10px]">
                      {change.changeType.replace('_', ' ')}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono">
                      {format(new Date(change.changedAt), "MMM d, yyyy HH:mm")}
                    </span>
                  </div>
                  <div className="bg-card border rounded p-3 text-sm mt-2">
                    <span className="font-semibold text-foreground mr-2">{change.fieldName}:</span>
                    <span className="text-muted-foreground line-through decoration-red-500/50 mr-2">{change.oldValue || "none"}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="text-primary font-medium ml-2">{change.newValue || "none"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="snapshots" className="pt-6">
          <div className="space-y-4">
            {snapshots?.map((snap) => (
              <Card key={snap.id}>
                <CardHeader className="py-3 px-4 bg-muted/20 border-b flex flex-row items-center justify-between">
                  <div className="text-sm font-mono font-bold">
                    {format(new Date(snap.checkedAt), "yyyy-MM-dd HH:mm:ss")}
                  </div>
                  <Badge variant={snap.fetchSuccess ? "default" : "destructive"}>
                    {snap.fetchSuccess ? "Success" : "Failed"}
                  </Badge>
                </CardHeader>
                <CardContent className="p-0">
                  {snap.fetchSuccess ? (
                    <pre className="p-4 text-xs font-mono bg-background text-muted-foreground overflow-x-auto max-h-[300px]">
                      {snap.extractedData ? JSON.stringify(JSON.parse(snap.extractedData), null, 2) : "No data"}
                    </pre>
                  ) : (
                    <div className="p-4 text-sm text-destructive bg-destructive/10">
                      {snap.errorMessage || "Unknown error"}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
