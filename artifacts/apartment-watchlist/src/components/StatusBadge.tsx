import React from "react";
import { Badge } from "@/components/ui/badge";

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;

  const normalizedStatus = status.toLowerCase();

  let className = "";
  let label = normalizedStatus.toUpperCase();

  switch (normalizedStatus) {
    case "active":
      className = "bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20";
      break;
    case "checking":
      className = "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border-blue-500/20";
      label = "LOADING";
      break;
    case "sold":
      className = "bg-gray-500/10 text-gray-500 hover:bg-gray-500/20 border-gray-500/20";
      break;
    case "pending":
      className = "bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 border-yellow-500/20";
      break;
    case "unavailable":
    case "removed":
    case "inactive":
      className = "bg-red-500/10 text-red-500 hover:bg-red-500/20 border-red-500/20";
      label = "INACTIVE";
      break;
    default:
      className = "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border-blue-500/20";
  }

  return (
    <Badge variant="default" className={className} data-testid={`status-badge-${normalizedStatus}`}>
      {label}
    </Badge>
  );
}
