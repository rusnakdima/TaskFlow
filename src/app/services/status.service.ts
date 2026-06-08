import { Injectable } from "@angular/core";
import { TaskStatus } from "@models/generated/api.types";
import {
  PRIORITY_COLORS,
  STATUS_ICONS,
  STATUS_BG_COLORS,
  STATUS_BUTTON_COLORS,
  STATUS_BUTTON_ICONS,
  PRIORITY_ICONS,
} from "@constants/table-field.constants";

@Injectable({
  providedIn: "root",
})
export class StatusService {
  getPriorityColor(priority: string): string {
    const p = (priority || "medium").toLowerCase();
    const colorMap: Record<string, string> = {
      low: "text-blue-600 dark:text-blue-400",
      medium: "text-yellow-600 dark:text-yellow-400",
      high: "text-red-600 dark:text-red-400",
    };
    return colorMap[p] || colorMap["medium"];
  }

  getPriorityDotColor(priority: string): string {
    const p = (priority || "medium").toLowerCase();
    switch (p) {
      case "high":
        return "bg-red-600 dark:bg-red-500";
      case "medium":
        return "bg-yellow-500 dark:bg-yellow-400";
      case "low":
        return "bg-green-600 dark:bg-green-500";
      default:
        return "bg-yellow-500 dark:bg-yellow-400";
    }
  }

  getPriorityBorderColor(priority: string): string {
    const p = (priority || "medium").toLowerCase();
    switch (p) {
      case "high":
        return "border-red-600 dark:border-red-500 border-l-4 border-l-red-700 dark:border-l-red-500";
      case "medium":
        return "border-yellow-500 dark:border-yellow-400 border-l-4 border-l-yellow-600 dark:border-l-yellow-500";
      case "low":
        return "border-green-600 dark:border-green-500 border-l-4 border-l-green-700 dark:border-l-green-500";
      default:
        return "border-yellow-500 dark:border-yellow-400 border-l-4 border-l-yellow-600 dark:border-l-yellow-500";
    }
  }

  getPriorityBgColor(priority: string): string {
    return PRIORITY_COLORS[priority as keyof typeof PRIORITY_COLORS] || PRIORITY_COLORS.medium;
  }

  getPriorityIcon(priority: string): string {
    const p = (priority || "medium").toLowerCase();
    return PRIORITY_ICONS[p as keyof typeof PRIORITY_ICONS] || PRIORITY_ICONS.medium;
  }

  getPriorityBadgeClass(priority: string): string {
    if (!priority) return "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300";
    const p = priority.toLowerCase();
    return PRIORITY_COLORS[p as keyof typeof PRIORITY_COLORS] || PRIORITY_COLORS.medium;
  }

  getStatusIcon(status: string): string {
    return STATUS_ICONS[status as keyof typeof STATUS_ICONS] || STATUS_ICONS[TaskStatus.PENDING];
  }

  getStatusBorderColor(status: string): string {
    switch (status) {
      case TaskStatus.COMPLETED:
        return "border-l-4 border-l-blue-500";
      case TaskStatus.SKIPPED:
        return "border-l-4 border-l-orange-500";
      case TaskStatus.FAILED:
        return "border-l-4 border-l-red-500";
      case TaskStatus.PENDING:
      default:
        return "border-l-4 border-l-gray-400";
    }
  }

  getStatusColorClass(status: string): string {
    switch (status) {
      case TaskStatus.COMPLETED:
        return "text-blue-500 dark:text-blue-400";
      case TaskStatus.SKIPPED:
        return "text-orange-500 dark:text-orange-400";
      case TaskStatus.FAILED:
        return "text-red-500 dark:text-red-400";
      case TaskStatus.PENDING:
      default:
        return "text-gray-400 dark:text-gray-500";
    }
  }

  getStatusBgColor(status: string): string {
    return (
      STATUS_BG_COLORS[status as keyof typeof STATUS_BG_COLORS] ||
      STATUS_BG_COLORS[TaskStatus.PENDING]
    );
  }

  getStatusButtonColor(status: string): string {
    return (
      STATUS_BUTTON_COLORS[status as keyof typeof STATUS_BUTTON_COLORS] ||
      STATUS_BUTTON_COLORS[TaskStatus.PENDING]
    );
  }

  getStatusButtonIcon(status: string): string {
    return (
      STATUS_BUTTON_ICONS[status as keyof typeof STATUS_BUTTON_ICONS] ||
      STATUS_BUTTON_ICONS[TaskStatus.PENDING]
    );
  }

  getStatusBadgeClass(status: string): string {
    switch (status?.toLowerCase()) {
      case "active":
      case "in_progress":
        return "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300";
      case "completed":
      case "done":
        return "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300";
      case "pending":
        return "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300";
      case "cancelled":
      case "deleted":
        return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300";
      default:
        return "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300";
    }
  }
}
