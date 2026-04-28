import React from "react";
import { Link } from "wouter";
import { Bell, Settings, ExternalLink, Sun, Moon } from "lucide-react";
import { 
  useGetNotifications, 
  useMarkAllNotificationsRead, 
  useMarkNotificationRead,
  getGetNotificationsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { useTheme } from "@/hooks/use-theme";

export function Header() {
  const queryClient = useQueryClient();
  const { theme, toggle } = useTheme();
  const financeHubUrl = import.meta.env.VITE_FINANCE_HUB_URL;
  const notifParams = { unreadOnly: "true" } as const;
  const { data: notificationsData } = useGetNotifications(
    notifParams,
    { query: { queryKey: getGetNotificationsQueryKey(notifParams), refetchInterval: 30000 } }
  );
  const notifications = Array.isArray(notificationsData) ? notificationsData : [];

  const markAllRead = useMarkAllNotificationsRead({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetNotificationsQueryKey() });
      }
    }
  });

  const markRead = useMarkNotificationRead({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetNotificationsQueryKey() });
      }
    }
  });

  return (
    <header className="border-b bg-card sticky top-0 z-50">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <Link href="/" className="font-bold text-lg font-mono tracking-tight text-primary flex items-center gap-2" data-testid="link-home">
            <div className="w-4 h-4 bg-primary rounded-sm" />
            APT.WATCH
          </Link>
          <nav className="hidden md:flex items-center space-x-4 text-sm">
            {financeHubUrl ? (
              <a
                href={financeHubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                Finance Hub
                <ExternalLink className="w-3 h-3" />
              </a>
            ) : null}
            <Link href="/settings" className="text-muted-foreground hover:text-foreground transition-colors" data-testid="link-settings">Settings</Link>
          </nav>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            title={theme === "dark" ? "Switch to day mode" : "Switch to night mode"}
            data-testid="btn-theme-toggle"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative" data-testid="btn-notifications">
                <Bell className="w-4 h-4" />
                {notifications.length > 0 && (
                  <Badge className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center p-0 text-[10px] bg-primary text-primary-foreground" data-testid="badge-notification-count">
                    {notifications.length}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel className="flex items-center justify-between">
                <span>Notifications</span>
                {notifications.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => markAllRead.mutate()} data-testid="btn-mark-all-read" className="h-auto p-0 text-xs">
                    Mark all read
                  </Button>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {notifications.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">No new notifications</div>
              ) : (
                <div className="max-h-[300px] overflow-y-auto">
                  {notifications.map((n) => {
                    const isDupe = n.type === "duplicate_detected";
                    return (
                    <DropdownMenuItem key={n.id} className={`flex flex-col items-start p-3 gap-1 cursor-pointer ${isDupe ? "border-l-2 border-amber-500/60" : ""}`} onClick={() => markRead.mutate({ id: n.id })}>
                      <div className="flex items-center justify-between w-full gap-2">
                        <span className={`font-medium text-sm truncate ${isDupe ? "text-amber-500" : ""}`}>
                          {isDupe ? "⚠ Duplicate blocked" : (n.listingTitle || "Unknown Listing")}
                        </span>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                          {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground line-clamp-2">{n.message}</span>
                    </DropdownMenuItem>
                    );
                  })}
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Link href="/settings" className="md:hidden" data-testid="link-settings-mobile">
            <Button variant="ghost" size="icon">
              <Settings className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
