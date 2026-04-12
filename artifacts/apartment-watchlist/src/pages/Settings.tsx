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
  notifyOnUnavailable: z.boolean(),
});

export default function Settings() {
  const { data: settings, isLoading } = useGetSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof settingsSchema>>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      checkIntervalHours: 24,
      extractionMode: "native",
      browseAiApiKey: "",
      browseAiRobotId: "",
      browseAiWebhookSecret: "",
      notifyOnPriceDrop: true,
      notifyOnUnavailable: true,
    },
  });

  React.useEffect(() => {
    if (settings) {
      form.reset({
        checkIntervalHours: settings.checkIntervalHours,
        extractionMode: settings.extractionMode as "native" | "browse_ai",
        browseAiApiKey: settings.browseAiApiKey || "",
        browseAiRobotId: settings.browseAiRobotId || "",
        browseAiWebhookSecret: settings.browseAiWebhookSecret || "",
        notifyOnPriceDrop: settings.notifyOnPriceDrop,
        notifyOnUnavailable: settings.notifyOnUnavailable,
      });
    }
  }, [settings, form]);

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

  if (isLoading) {
    return <div className="p-6 container mx-auto max-w-4xl space-y-6"><Skeleton className="h-64 w-full" /></div>;
  }

  return (
    <div className="flex-1 p-6 container mx-auto max-w-4xl space-y-6 pb-20">
      <div className="flex items-center gap-2 pb-4 border-b border-border">
        <SettingsIcon className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">System Configuration</h1>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          
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

              {form.watch("extractionMode") === "browse_ai" && (
                <Card className="border-primary/50">
                  <CardHeader className="bg-primary/5">
                    <CardTitle className="flex items-center text-primary">
                      <Bot className="w-5 h-5 mr-2" />
                      Browse AI Configuration
                    </CardTitle>
                    <CardDescription>Required credentials for using the Browse AI extraction engine.</CardDescription>
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
