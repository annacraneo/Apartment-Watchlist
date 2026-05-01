import React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useGetSettings,
  useUpdateSettings,
  useMarkAllNotificationsRead,
  getGetSettingsQueryKey,
  getGetNotificationsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Settings as SettingsIcon, Save, Key, Bot, Shield, Bell, RefreshCw } from "lucide-react";

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

const settingsSchema = z.object({
  checkIntervalHours: z.coerce.number().min(1).max(168),
  extractionMode: z.enum(["native", "browse_ai"]),
  browseAiApiKey: z.string().optional(),
  browseAiRobotId: z.string().optional(),
  browseAiWebhookSecret: z.string().optional(),
  notifyOnPriceDrop: z.boolean(),
  notifyOnStatusChange: z.boolean(),
  notifyOnUnavailable: z.boolean(),
  llmProvider: z.enum(["disabled", "ollama", "openrouter", "openai_compatible"]),
  llmModel: z.string().optional(),
});

export default function Settings() {
  const { data: settings, isLoading } = useGetSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Don't mount the form until settings are loaded so Select components
  // get the correct value from the start (Radix Select ignores value prop changes after mount).
  if (isLoading || !settings) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return <SettingsForm settings={settings} />;
}

function SettingsForm({
  settings,
}: {
  settings: NonNullable<ReturnType<typeof useGetSettings>["data"]>;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const form = useForm<z.infer<typeof settingsSchema>>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      checkIntervalHours: settings.checkIntervalHours,
      extractionMode: settings.extractionMode as "native" | "browse_ai",
      browseAiApiKey: settings.browseAiApiKey || "",
      browseAiRobotId: settings.browseAiRobotId || "",
      browseAiWebhookSecret: settings.browseAiWebhookSecret || "",
      notifyOnPriceDrop: settings.notifyOnPriceDrop,
      notifyOnStatusChange: settings.notifyOnStatusChange,
      notifyOnUnavailable: settings.notifyOnUnavailable,
      llmProvider: settings.llmProvider ?? "disabled",
      llmModel: settings.llmModel || "qwen2.5:7b-instruct",
    },
  });

  const updateSettings = useUpdateSettings({
    mutation: {
      onSuccess: () => {
        toast({ title: "Settings saved successfully" });
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      },
      onError: (err) => {
        toast({ title: "Failed to save settings", description: err.message, variant: "destructive" });
      }
    }
  });

  const clearNotifications = useMarkAllNotificationsRead({
    mutation: {
      onSuccess: () => {
        toast({ title: "All notifications cleared" });
        queryClient.invalidateQueries({ queryKey: getGetNotificationsQueryKey() });
      },
      onError: (err) => {
        toast({ title: "Failed to clear notifications", description: err.message, variant: "destructive" });
      }
    }
  });

  function onSubmit(values: z.infer<typeof settingsSchema>) {
    updateSettings.mutate({ data: values });
  }

  function onInvalid(errors: Record<string, unknown>) {
    console.error("Settings form validation failed:", errors);
    toast({ title: "Could not save — form has errors", description: Object.keys(errors).join(", "), variant: "destructive" });
  }

  const watchedApiKey = form.watch("browseAiApiKey");
  const watchedRobotId = form.watch("browseAiRobotId");
  const watchedMode = form.watch("extractionMode");
  const watchedProvider = form.watch("llmProvider");

  // When provider changes (user interaction only), auto-fill a sensible model default
  const prevProviderRef = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    if (!watchedProvider) return;
    if (prevProviderRef.current === watchedProvider) return;
    // Only auto-fill when the user actively changes provider (not on initial load)
    if (prevProviderRef.current !== undefined) {
      const defaults: Record<string, string> = {
        ollama: "qwen2.5:7b-instruct",
        openrouter: "google/gemma-3-12b-it:free",
        openai_compatible: "gpt-4o-mini",
      };
      if (defaults[watchedProvider]) form.setValue("llmModel", defaults[watchedProvider]);
    }
    prevProviderRef.current = watchedProvider;
  }, [watchedProvider, form]);

  // Show Browse AI credentials panel if: global mode is browse_ai OR creds are already set
  const showBrowseAiPanel =
    watchedMode === "browse_ai" ||
    !!watchedApiKey ||
    !!watchedRobotId ||
    !!(settings?.browseAiApiKey) ||
    !!(settings?.browseAiRobotId);

  return (
    <div className="flex-1 p-6 container mx-auto max-w-4xl space-y-6 pb-20">
      <div className="flex items-center gap-2 pb-4 border-b border-border">
        <SettingsIcon className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">System Configuration</h1>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Extraction Engine</CardTitle>
              <CardDescription>Configure how data is extracted from listing URLs.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="extractionMode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Global Default Mode</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-global-mode">
                            <SelectValue placeholder="Select mode" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="native">Native (Fast, built-in parser)</SelectItem>
                          <SelectItem value="browse_ai">Browse AI (Robust, handles CAPTCHA)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>Native is faster but may be blocked by anti-bot measures.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="checkIntervalHours"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Check Interval (Hours)</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} {...field} data-testid="input-check-interval" />
                      </FormControl>
                      <FormDescription>How often the background job checks for updates.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="llmProvider"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rent LLM Provider</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "disabled"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-llm-provider">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="disabled">Disabled (heuristic only)</SelectItem>
                          <SelectItem value="ollama">Ollama (Local)</SelectItem>
                          <SelectItem value="openrouter">OpenRouter (Free / Cloud)</SelectItem>
                          <SelectItem value="openai_compatible">OpenAI-Compatible</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        {watchedProvider === "ollama" && "Runs locally on your machine. Requires Ollama running at http://127.0.0.1:11434."}
                        {watchedProvider === "openrouter" && "Free cloud models via OpenRouter. Requires OPENROUTER_API_KEY in your environment."}
                        {watchedProvider === "openai_compatible" && "Any OpenAI-compatible API (OpenAI, custom endpoint). Requires OPENAI_API_KEY."}
                        {(!watchedProvider || watchedProvider === "disabled") && "LLM is off — only heuristic regex extraction will run."}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="llmModel"
                  render={({ field: modelField }) => {
                    const provider = watchedProvider;
                    const ollamaModels = ["qwen2.5:7b-instruct", "qwen2.5:3b-instruct", "llama3.2:3b", "mistral:7b"];
                    const openrouterModels = [
                      "google/gemma-3-12b-it:free",
                      "google/gemma-4-31b-it:free",
                      "meta-llama/llama-3.3-70b-instruct:free",
                      "openai/gpt-oss-20b:free",
                      "google/gemma-3-27b-it:free",
                    ];
                    const openaiModels = ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"];
                    const modelOptions =
                      provider === "ollama" ? ollamaModels :
                      provider === "openrouter" ? openrouterModels :
                      provider === "openai_compatible" ? openaiModels : [];

                    if (provider === "disabled" || modelOptions.length === 0) return <></>;

                    return (
                      <FormItem>
                        <FormLabel>LLM Model</FormLabel>
                        <Select
                          value={modelField.value ?? modelOptions[0]}
                          onValueChange={modelField.onChange}
                          data-testid="select-llm-model"
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select model" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {modelOptions.map((m) => (
                              <SelectItem key={m} value={m}>{m}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          {provider === "openrouter" && "All listed models are free tier on OpenRouter."}
                          {provider === "ollama" && "Make sure the model is pulled locally: ollama pull <model>"}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              </div>

              {/* Browse AI credentials — shown when mode is browse_ai OR when creds already exist */}
              {showBrowseAiPanel && (
                <Card className="border-primary/50">
                  <CardHeader className="bg-primary/5">
                    <CardTitle className="flex items-center text-primary">
                      <Bot className="w-5 h-5 mr-2" />
                      Browse AI Configuration
                    </CardTitle>
                    <CardDescription>
                      Credentials for the Browse AI extraction engine. Required when using Browse AI mode for scraping listings.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 mt-4">
                    <FormField
                      control={form.control}
                      name="browseAiApiKey"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center"><Key className="w-3 h-3 mr-1" /> API Key</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="••••••••••••••••" {...field} data-testid="input-browse-api-key" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="browseAiRobotId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center"><Bot className="w-3 h-3 mr-1" /> Robot ID</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. 5d7f8..." {...field} data-testid="input-browse-robot-id" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="browseAiWebhookSecret"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center"><Shield className="w-3 h-3 mr-1" /> Webhook Secret</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="••••••••••••••••" {...field} data-testid="input-browse-webhook-secret" />
                          </FormControl>
                          <FormDescription>Used to verify incoming webhook requests from Browse AI.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              )}

              {/* Prompt to enter Browse AI creds if mode is native and no creds yet */}
              {!showBrowseAiPanel && (
                <p className="text-sm text-muted-foreground">
                  To use Browse AI for extraction, switch the mode above to <strong>Browse AI</strong> and
                  enter your credentials — the configuration panel will appear automatically.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Bell className="w-5 h-5 mr-2" />
                Notification Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="notifyOnPriceDrop"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 bg-background shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base font-semibold">Price Drops</FormLabel>
                      <FormDescription>Create a notification when a tracked listing's price decreases.</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="toggle-notify-price" />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notifyOnStatusChange"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 bg-background shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base font-semibold">Status Changes</FormLabel>
                      <FormDescription>Create a notification when listing status changes between active/inactive.</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notifyOnUnavailable"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 bg-background shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base font-semibold">Listing Removed</FormLabel>
                      <FormDescription>Create a notification when a listing becomes unavailable or is deleted from the source.</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="toggle-notify-removed" />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter className="bg-muted/20 border-t p-4 flex justify-between items-center">
              <Button
                type="button"
                variant="outline"
                disabled={clearNotifications.isPending}
                onClick={() => clearNotifications.mutate()}
                data-testid="btn-clear-notifications"
              >
                {clearNotifications.isPending
                  ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  : <Bell className="w-4 h-4 mr-2" />}
                Clear All Notifications
              </Button>
              <Button type="submit" disabled={updateSettings.isPending} data-testid="btn-save-settings">
                {updateSettings.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save Settings
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
    </div>
  );
}
