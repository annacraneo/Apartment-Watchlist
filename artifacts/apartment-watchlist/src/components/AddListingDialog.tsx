import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateListing, useUpdateListing, getGetListingsQueryKey, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Loader2 } from "lucide-react";
import { BoroughCombobox } from "@/components/BoroughCombobox";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  listingUrl: z.string().url({ message: "Please enter a valid URL." }),
  notes: z.string().optional(),
  interestLevel: z.enum(["low", "medium", "high"]).optional(),
});

function petsValueToLabel(value: string): string {
  if (value === "all_pets" || value === "pets_allowed" || value === "pet_friendly_unspecified") return "all_pets";
  if (value === "cats_only" || value === "cats_allowed") return "cats_only";
  return "";
}

function petsLabelToValue(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "all pets" || normalized === "all_pets") return "all_pets";
  if (normalized === "cats only" || normalized === "cats_only") return "cats_only";
  if (normalized === "cats + dogs" || normalized === "cats_and_dogs") return "cats_and_dogs";
  if (normalized === "no pets" || normalized === "no_pets") return "no_pets";
  return value;
}

function furnishedValueToLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "yes" || normalized === "furnished") return "yes";
  if (normalized === "no" || normalized === "unfurnished") return "no";
  return "";
}


function airConditioningValueToLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "yes") return "yes";
  if (normalized === "no") return "no";
  return "";
}

function parkingValueToLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "no" || normalized.includes("no parking") || normalized.includes("without parking")) return "No";
  if (normalized === "yes" || normalized.includes("parking") || normalized.includes("stationnement")) return "Yes";
  return "";
}

const BOROUGH_OPTIONS = [
  "Ahuntsic-Cartierville",
  "Anjou",
  "Côte-des-Neiges/Notre-Dame-de-Grâce",
  "Lachine",
  "LaSalle",
  "Le Plateau-Mont-Royal",
  "Le Sud-Ouest",
  "L'Île-Bizard/Sainte-Geneviève",
  "Mercier-Hochelaga-Maisonneuve",
  "Montréal-Nord",
  "Outremont",
  "Pierrefonds-Roxboro",
  "Rivière-des-Prairies/Pointe-aux-Trembles",
  "Rosemont/La Petite-Patrie",
  "Saint-Laurent",
  "Saint-Léonard",
  "Verdun",
  "Ville-Marie",
  "Villeray/Saint-Michel/Parc-Extension",
] as const;

function missingClass(value: string): string {
  return value.trim() ? "" : "border-yellow-500/60 bg-yellow-500/10";
}

export function AddListingDialog({
  listingType = "buy",
}: {
  listingType?: "buy" | "rent";
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"form" | "review">("form");
  const [createdListingId, setCreatedListingId] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewStepLabel, setPreviewStepLabel] = useState<string>("");
  const [pendingCreatePayload, setPendingCreatePayload] = useState<{
    listingUrl: string;
    notes: string | null;
    interestLevel: "low" | "medium" | "high" | null;
  } | null>(null);
  const [reviewValues, setReviewValues] = useState({
    currentPrice: "",
    address: "",
    neighborhood: "",
    bedrooms: "",
    bathrooms: "",
    squareFeet: "",
    parkingInfo: "",
    furnishedStatus: "",
    availableFrom: "",
    petsAllowedInfo: "",
    floor: "",
    airConditioning: "",
    appliancesIncluded: "",
    notes: "",
  });
  const [extractionEngineLabel, setExtractionEngineLabel] = useState<string>("Heuristic");
  const [extractionEngineReason, setExtractionEngineReason] = useState<string>("");
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      listingUrl: "",
      notes: "",
      interestLevel: "medium",
    },
  });

  const updateListing = useUpdateListing({
    mutation: {
      onSuccess: () => {
        toast({ title: "Rent fields reviewed and saved" });
        queryClient.invalidateQueries({ queryKey: getGetListingsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        setOpen(false);
        setStep("form");
        setCreatedListingId(null);
        setPendingCreatePayload(null);
        setTouchedFields(new Set());
        form.reset();
      },
      onError: (error) => {
        toast({
          title: "Failed to save review",
          description: error?.message || "Unknown error occurred.",
          variant: "destructive",
        });
      },
    },
  });

  const createListing = useCreateListing({
    mutation: {
      onSuccess: (created) => {
        if (listingType === "rent" && created?.id && !pendingCreatePayload) {
          setCreatedListingId(created.id);
          setReviewValues({
            currentPrice: created.currentPrice || "",
            address: created.address || "",
            neighborhood: created.neighborhood || "",
            bedrooms: created.bedrooms != null ? String(created.bedrooms) : "",
            bathrooms: created.bathrooms != null ? String(created.bathrooms) : "",
            squareFeet: created.squareFeet != null ? String(created.squareFeet) : "",
            parkingInfo: parkingValueToLabel(created.parkingInfo || ""),
            furnishedStatus: furnishedValueToLabel(created.furnishedStatus || ""),
            availableFrom: created.availableFrom || "",
            petsAllowedInfo: petsValueToLabel(created.petsAllowedInfo || ""),
            floor: created.floor || "",
            airConditioning: airConditioningValueToLabel(created.airConditioning || ""),
            appliancesIncluded: created.appliancesIncluded || "",
            notes: created.notes || "",
          });
          setStep("review");
          return;
        }
        if (listingType === "rent") return;
        toast({ title: "Listing added successfully" });
        queryClient.invalidateQueries({ queryKey: getGetListingsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        setOpen(false);
        form.reset();
      },
      onError: (error) => {
        toast({
          title: "Failed to add listing",
          description: error?.message || "Unknown error occurred.",
          variant: "destructive",
        });
      },
    }
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    const payload = {
      listingUrl: values.listingUrl,
      notes: values.notes || null,
      interestLevel: values.interestLevel || null,
    };

    if (listingType !== "rent") {
      createListing.mutate({
        data: { ...payload, listingType },
      });
      return;
    }

    setPreviewLoading(true);
    setPreviewStepLabel("fetching");
    const stepTimer = window.setTimeout(() => {
      setPreviewStepLabel("extracting");
    }, 800);
    try {
      const res = await fetch("/api/listings/preview-extraction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingUrl: payload.listingUrl,
          listingType: "rent",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to preview extraction");
      setPendingCreatePayload(payload);
      const extracted = data?.data ?? {};
      let engineLabel = "Heuristic";
      let engineReason = "";
      if (typeof extracted.extractionWarnings === "string" && extracted.extractionWarnings.trim()) {
        try {
          const warnings = JSON.parse(extracted.extractionWarnings) as unknown;
          if (Array.isArray(warnings)) {
            const engineMsg = warnings.find(
              (w): w is string => typeof w === "string" && w.toLowerCase().startsWith("extraction engine:"),
            );
            if (engineMsg) {
              const cleaned = engineMsg.replace(/^Extraction engine:\s*/i, "").trim();
              const reasonMatch = cleaned.match(/\(([^)]+)\)\s*$/);
              if (reasonMatch?.[1]) {
                engineReason = reasonMatch[1];
                engineLabel = cleaned.replace(/\s*\([^)]+\)\s*$/, "").trim();
              } else {
                engineLabel = cleaned;
              }
            }
          }
        } catch {
          // Ignore malformed warning payload and keep default label.
        }
      }
      setExtractionEngineLabel(engineLabel);
      setExtractionEngineReason(engineReason);
      setReviewValues({
        currentPrice: extracted.currentPrice || "",
        address: extracted.address || "",
        neighborhood: extracted.neighborhood || "",
        bedrooms: extracted.bedrooms != null ? String(extracted.bedrooms) : "",
        bathrooms: extracted.bathrooms != null ? String(extracted.bathrooms) : "",
        squareFeet: extracted.squareFeet != null ? String(extracted.squareFeet) : "",
        parkingInfo: parkingValueToLabel(extracted.parkingInfo || ""),
        furnishedStatus: furnishedValueToLabel(extracted.furnishedStatus || ""),
        availableFrom: extracted.availableFrom || "",
        petsAllowedInfo: petsValueToLabel(extracted.petsAllowedInfo || ""),
        floor: extracted.floor || "",
        airConditioning: airConditioningValueToLabel(extracted.airConditioning || ""),
        appliancesIncluded: extracted.appliancesIncluded || "",
        notes: payload.notes || "",
      });
      setStep("review");
    } catch (error: unknown) {
      toast({
        title: "Failed to preview rent extraction",
        description: error instanceof Error ? error.message : "Unknown error occurred.",
        variant: "destructive",
      });
    } finally {
      window.clearTimeout(stepTimer);
      setPreviewLoading(false);
      setPreviewStepLabel("");
    }
  }

  function updateReviewField(field: keyof typeof reviewValues, value: string) {
    setReviewValues((prev) => ({ ...prev, [field]: value }));
    setTouchedFields((prev) => new Set(prev).add(field));
  }

  function onSubmitReview() {
    const patchData: Record<string, unknown> = {};
    const lockSet = new Set<string>(Array.from(touchedFields));
    const put = (field: string, value: string, map?: (v: string) => string) => {
      const normalized = (map ? map(value) : value).trim();
      if (normalized) {
        patchData[field] = normalized;
        lockSet.add(field);
      } else if (touchedFields.has(field)) {
        patchData[field] = null;
        lockSet.add(field);
      }
    };
    put("currentPrice", reviewValues.currentPrice);
    put("address", reviewValues.address);
    put("neighborhood", reviewValues.neighborhood);
    // Integer fields: store as string in form, send as int or null
    const putInt = (field: string, value: string) => {
      const n = parseInt(value, 10);
      if (!isNaN(n)) { patchData[field] = n; lockSet.add(field); }
      else if (touchedFields.has(field)) { patchData[field] = null; lockSet.add(field); }
    };
    putInt("bedrooms", reviewValues.bedrooms);
    putInt("bathrooms", reviewValues.bathrooms);
    putInt("squareFeet", reviewValues.squareFeet);
    put("parkingInfo", reviewValues.parkingInfo);
    put("furnishedStatus", reviewValues.furnishedStatus);
    put("availableFrom", reviewValues.availableFrom);
    put("petsAllowedInfo", reviewValues.petsAllowedInfo, petsLabelToValue);
    put("floor", reviewValues.floor);
    put("airConditioning", reviewValues.airConditioning);
    put("appliancesIncluded", reviewValues.appliancesIncluded);
    put("notes", reviewValues.notes);
    patchData.lockedFields = Array.from(lockSet);
    if (listingType !== "rent") {
      if (!createdListingId) return;
      updateListing.mutate({
        id: createdListingId,
        data: patchData,
      });
      return;
    }

    if (!pendingCreatePayload) {
      toast({ title: "Nothing to save", description: "Please run extraction preview first.", variant: "destructive" });
      return;
    }

    createListing.mutate(
      {
        data: {
          ...pendingCreatePayload,
          listingType: "rent",
        },
      },
      {
        onSuccess: (created) => {
          updateListing.mutate({
            id: created.id,
            data: patchData,
          });
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => {
      setOpen(next);
      if (!next) {
        setStep("form");
        setCreatedListingId(null);
        setPendingCreatePayload(null);
        setPreviewStepLabel("");
        setExtractionEngineLabel("Heuristic");
        setExtractionEngineReason("");
        setTouchedFields(new Set());
      }
    }}>
      <DialogTrigger asChild>
        <Button data-testid="btn-add-listing-dialog" size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Add Listing
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]" data-testid="dialog-add-listing">
        <DialogHeader>
          <DialogTitle>
            {step === "review"
              ? "Review extracted rent fields"
              : `Add New ${listingType === "rent" ? "Rental" : "Buy"} Listing`}
          </DialogTitle>
          <DialogDescription>
            {step === "review"
              ? "Confirm or edit the extracted values. Edited fields are locked and won't be overwritten silently."
              : `Paste a URL to start tracking this ${listingType === "rent" ? "rental" : "buy"} listing.`}
          </DialogDescription>
        </DialogHeader>
        {step === "form" ? (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="listingUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Listing URL</FormLabel>
                  <FormControl>
                    <Input placeholder="https://www.centris.ca/..." {...field} data-testid="input-listing-url" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="interestLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Interest Level</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-interest-level">
                          <SelectValue placeholder="Select level" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Initial Notes</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Any initial thoughts..." className="resize-none" {...field} data-testid="input-notes" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end pt-4">
              {listingType === "rent" && previewLoading ? (
                <div className="flex flex-col items-center gap-2 w-full">
                  <style>{`
                    @keyframes llama-dance {
                      0%   { transform: rotate(-10deg) scale(1);   }
                      25%  { transform: rotate(10deg)  scale(1.15); }
                      50%  { transform: rotate(-8deg)  scale(1);   }
                      75%  { transform: rotate(8deg)   scale(1.1); }
                      100% { transform: rotate(-10deg) scale(1);   }
                    }
                    .llama-dance { animation: llama-dance 0.7s ease-in-out infinite; display: inline-block; }
                  `}</style>
                  <span className="text-6xl llama-dance leading-none select-none">🪄</span>
                  <span className="text-sm text-muted-foreground font-medium tracking-wide">
                    {previewStepLabel === "fetching"
                      ? "✨ Fetching listing... ✨"
                      : "✨ some extraction magic happening ✨"}
                  </span>
                </div>
              ) : (
                <Button type="submit" disabled={createListing.isPending || previewLoading} data-testid="btn-submit-listing">
                  {createListing.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {listingType === "rent" ? "Preview Extraction" : "Add Listing"}
                </Button>
              )}
            </div>
          </form>
        </Form>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs">
              {extractionEngineLabel.toLowerCase().startsWith("heuristic") ? (
                <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/15 text-amber-400 px-2 py-0.5 font-medium">
                  Heuristic
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-blue-500/40 bg-blue-500/15 text-blue-400 px-2 py-0.5 font-medium">
                  LLM
                </span>
              )}
              <span className="text-muted-foreground">
                {extractionEngineLabel.toLowerCase().startsWith("heuristic")
                  ? `Heuristic extraction used${extractionEngineReason ? `: ${extractionEngineReason}` : "."}`
                  : `LLM extraction used: ${extractionEngineLabel}`}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Rent Price</Label>
                <Input className={missingClass(reviewValues.currentPrice)} value={reviewValues.currentPrice} onChange={(e) => updateReviewField("currentPrice", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Available From</Label>
                <Input className={missingClass(reviewValues.availableFrom)} value={reviewValues.availableFrom} onChange={(e) => updateReviewField("availableFrom", e.target.value)} placeholder="May 1, 2026" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Address</Label>
              <Input className={missingClass(reviewValues.address)} value={reviewValues.address} onChange={(e) => updateReviewField("address", e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Bedrooms</Label>
                <Input type="number" min={0} className={missingClass(reviewValues.bedrooms)} value={reviewValues.bedrooms} onChange={(e) => updateReviewField("bedrooms", e.target.value)} placeholder="e.g. 2" />
              </div>
              <div className="space-y-1">
                <Label>Bathrooms</Label>
                <Input type="number" min={0} className={missingClass(reviewValues.bathrooms)} value={reviewValues.bathrooms} onChange={(e) => updateReviewField("bathrooms", e.target.value)} placeholder="e.g. 1" />
              </div>
              <div className="space-y-1">
                <Label>Area (sqft)</Label>
                <Input type="number" min={0} className={missingClass(reviewValues.squareFeet)} value={reviewValues.squareFeet} onChange={(e) => updateReviewField("squareFeet", e.target.value)} placeholder="e.g. 650" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Neighborhood</Label>
              <BoroughCombobox
                value={reviewValues.neighborhood}
                onChange={(v) => updateReviewField("neighborhood", v ?? "")}
                options={BOROUGH_OPTIONS}
                triggerClassName={missingClass(reviewValues.neighborhood)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Pets Allowed</Label>
                <Select value={reviewValues.petsAllowedInfo} onValueChange={(v) => updateReviewField("petsAllowedInfo", v)}>
                  <SelectTrigger className={missingClass(reviewValues.petsAllowedInfo)}>
                    <SelectValue placeholder="Select pets policy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all_pets">All pets</SelectItem>
                    <SelectItem value="cats_only">Cats only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Parking</Label>
                <Select value={reviewValues.parkingInfo || "unknown"} onValueChange={(v) => updateReviewField("parkingInfo", v === "unknown" ? "" : v)}>
                  <SelectTrigger className={missingClass(reviewValues.parkingInfo)}>
                    <SelectValue placeholder="Select parking" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unknown">Unknown</SelectItem>
                    <SelectItem value="No">No</SelectItem>
                    <SelectItem value="Yes">Yes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Furnished</Label>
                <Select value={reviewValues.furnishedStatus || "unknown"} onValueChange={(v) => updateReviewField("furnishedStatus", v === "unknown" ? "" : v)}>
                  <SelectTrigger className={missingClass(reviewValues.furnishedStatus)}>
                    <SelectValue placeholder="Select furnished status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unknown">Unknown</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Floor</Label>
                <Input className={missingClass(reviewValues.floor)} value={reviewValues.floor} onChange={(e) => updateReviewField("floor", e.target.value)} placeholder="e.g. 2nd floor" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Air Conditioning</Label>
                <Select value={reviewValues.airConditioning || "unknown"} onValueChange={(v) => updateReviewField("airConditioning", v === "unknown" ? "" : v)}>
                  <SelectTrigger className={missingClass(reviewValues.airConditioning)}>
                    <SelectValue placeholder="Select A/C status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unknown">Unknown</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Appliances Included</Label>
                <Select value={reviewValues.appliancesIncluded || "unknown"} onValueChange={(v) => updateReviewField("appliancesIncluded", v === "unknown" ? "" : v)}>
                  <SelectTrigger className={missingClass(reviewValues.appliancesIncluded)}><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unknown">Unknown</SelectItem>
                    <SelectItem value="Yes">Yes</SelectItem>
                    <SelectItem value="No">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea value={reviewValues.notes} onChange={(e) => updateReviewField("notes", e.target.value)} />
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep("form")}>Back</Button>
              <Button onClick={onSubmitReview} disabled={updateListing.isPending || createListing.isPending} data-testid="btn-submit-rent-review">
                {(updateListing.isPending || createListing.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Review
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
