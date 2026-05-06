/* sys lib */

/* models */
import { Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";

/* helpers */
import { DateHelper } from "./date.helper";

/* constants */
import {
  PRIORITY_COLORS,
  STATUS_COLORS,
  STATUS_ICONS,
  STATUS_COLUMN_COLORS,
} from "../constants/table-field.constants";

/**
 * Base helper for item components (Task, Subtask, Todo)
 * Provides common methods for status/priority handling
 */
export class BaseItemHelper {
  /**
   * Get status color class
   */
  static getStatusColor(status: string): string {
    return STATUS_COLORS[status as keyof typeof STATUS_COLORS] || STATUS_COLORS[TaskStatus.PENDING];
  }

  /**
   * Get column color class based on status (Kanban specific)
   */
  static getColumnColorClass(status: string): string {
    return (
      STATUS_COLUMN_COLORS[status as keyof typeof STATUS_COLUMN_COLORS] ||
      STATUS_COLUMN_COLORS[TaskStatus.PENDING]
    );
  }

  /**
   * Get assignee color based on name hash
   */
  static getAssigneeColor(assignee: string): string {
    const colors = [
      "bg-blue-500",
      "bg-green-500",
      "bg-purple-500",
      "bg-orange-500",
      "bg-pink-500",
      "bg-teal-500",
      "bg-indigo-500",
      "bg-red-500",
    ];

    let hash = 0;
    for (let i = 0; i < assignee.length; i++) {
      hash = assignee.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  /**
   * Get initials from name
   */
  static getInitials(name: string): string {
    if (!name) return "?";
    return name.substring(0, 1).toUpperCase();
  }

  /**
   * Get the next status in the cycle: Pending -> Completed -> Skipped -> Failed -> Pending
   */
  static getNextStatus(currentStatus: TaskStatus): TaskStatus {
    const statusCycle: TaskStatus[] = [
      TaskStatus.PENDING,
      TaskStatus.COMPLETED,
      TaskStatus.SKIPPED,
      TaskStatus.FAILED,
    ];

    const currentIndex = statusCycle.indexOf(currentStatus);
    if (currentIndex === -1 || currentIndex === statusCycle.length - 1) {
      return statusCycle[0];
    }
    return statusCycle[currentIndex + 1];
  }

  /**
   * Get status icon
   */
  static getStatusIcon(status: string): string {
    return STATUS_ICONS[status as keyof typeof STATUS_ICONS] || STATUS_ICONS[TaskStatus.PENDING];
  }

  /**
   * Get priority color class
   */
  static getPriorityColor(priority: string): string {
    const p = priority.toLowerCase();
    const colorMap: Record<string, string> = {
      low: "text-blue-600 dark:text-blue-400",
      medium: "text-yellow-600 dark:text-yellow-400",
      high: "text-red-600 dark:text-red-400",
    };
    return colorMap[p] || colorMap["low"];
  }

  /**
   * Get priority badge class
   */
  static getPriorityBadgeClass(priority: string): string {
    if (!priority) return "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300";
    const p = priority.toLowerCase();
    return PRIORITY_COLORS[p as keyof typeof PRIORITY_COLORS] || PRIORITY_COLORS.low;
  }

  /**
   * Get status badge class
   */
  static getStatusBadgeClass(status: string): string {
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

  /**
   * Calculate progress percentage
   */
  static calculateProgress(completed: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((completed / total) * 100);
  }

  /**
   * Count completed items
   */
  static countCompleted<T extends { status: string }>(items: T[]): number {
    if (!Array.isArray(items)) return 0;
    return items.filter(
      (item) => item.status === TaskStatus.COMPLETED || item.status === TaskStatus.SKIPPED
    ).length;
  }

  /**
   * Get task progress percentage
   */
  static getTaskProgressPercentage(task: Task, subtasks: Subtask[]): number {
    if (subtasks.length === 0) {
      return task.status === TaskStatus.COMPLETED || task.status === TaskStatus.SKIPPED ? 100 : 0;
    }
    return BaseItemHelper.calculateProgress(
      BaseItemHelper.countCompleted(subtasks),
      subtasks.length
    );
  }

  /**
   * Check if item is blocked by dependencies
   */
  static isBlockedByDependencies(
    dependsOn: string[] | undefined,
    allItems: Array<{ id: string; status: string }>
  ): boolean {
    if (!dependsOn || dependsOn.length === 0) return false;

    return dependsOn.some((depId) => {
      const depItem = allItems.find((t) => t.id === depId);
      return (
        !depItem ||
        (depItem.status !== TaskStatus.COMPLETED && depItem.status !== TaskStatus.SKIPPED)
      );
    });
  }

  /**
   * Get progress segments for progress bar
   */
  static getProgressSegments(items: Array<{ status: string }> | undefined | null): Array<{
    status: string;
    percentage: number;
    color: string;
  }> {
    // Handle undefined or null or non-array items
    if (!Array.isArray(items) || items.length === 0) {
      return [{ status: TaskStatus.PENDING, percentage: 100, color: "bg-gray-400" }];
    }

    const total = items.length;

    const completed = items.filter((s) => s.status === TaskStatus.COMPLETED).length;
    const skipped = items.filter((s) => s.status === TaskStatus.SKIPPED).length;
    const failed = items.filter((s) => s.status === TaskStatus.FAILED).length;
    const pending = items.filter((s) => s.status === TaskStatus.PENDING).length;

    const segments: Array<{ status: string; percentage: number; color: string }> = [];

    if (completed > 0) {
      segments.push({
        status: TaskStatus.COMPLETED,
        percentage: Math.round((completed / total) * 100),
        color: "bg-green-500",
      });
    }
    if (skipped > 0) {
      segments.push({
        status: TaskStatus.SKIPPED,
        percentage: Math.round((skipped / total) * 100),
        color: "bg-orange-500",
      });
    }
    if (failed > 0) {
      segments.push({
        status: TaskStatus.FAILED,
        percentage: Math.round((failed / total) * 100),
        color: "bg-red-500",
      });
    }
    if (pending > 0) {
      segments.push({
        status: TaskStatus.PENDING,
        percentage: Math.round((pending / total) * 100),
        color: "bg-gray-400",
      });
    }

    return segments;
  }
}
