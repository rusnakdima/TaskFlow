/* sys lib */

/* models */
import { Task, TaskStatus, Subtask } from "@models/generated/api.types";

/* helpers */

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
   * Get assignee color
   */
  static getAssigneeColor(assignee: string): string {
    if (!assignee) return "bg-gray-200 dark:bg-gray-600";
    const colors = [
      "bg-red-400",
      "bg-orange-400",
      "bg-amber-400",
      "bg-yellow-400",
      "bg-lime-400",
      "bg-green-400",
      "bg-emerald-400",
      "bg-teal-400",
      "bg-cyan-400",
      "bg-sky-400",
      "bg-blue-400",
      "bg-indigo-400",
      "bg-violet-400",
      "bg-purple-400",
      "bg-fuchsia-400",
      "bg-pink-400",
    ];
    let hash = 0;
    for (let i = 0; i < assignee.length; i++) {
      hash = assignee.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length] + " text-white";
  }

  /**
   * Get initials from name
   */
  static getInitials(name: string): string {
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  /**
   * Check if task is blocked by dependencies
   */
  static isBlockedByDependencies(
    dependsOn: string | string[] | null | undefined,
    allTasks: Task[]
  ): boolean {
    if (!dependsOn || !allTasks || allTasks.length === 0) return false;
    const deps = Array.isArray(dependsOn) ? dependsOn : [dependsOn];
    for (const depId of deps) {
      const depTask = allTasks.find((t) => t.id === depId);
      if (
        depTask &&
        depTask.status !== TaskStatus.COMPLETED &&
        depTask.status !== TaskStatus.SKIPPED
      ) {
        return true;
      }
    }
    return false;
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
    if (!priority)
      return "bg-transparent text-gray-600 border border-gray-400 dark:text-gray-400 dark:border-gray-400/50";
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
        return "bg-transparent text-green-600 border border-green-500 dark:text-green-400 dark:border-green-400/50";
      case "completed":
      case "done":
        return "bg-transparent text-blue-600 border border-blue-500 dark:text-blue-400 dark:border-blue-400/50";
      case "pending":
        return "bg-transparent text-yellow-600 border border-yellow-500 dark:text-yellow-400 dark:border-yellow-400/50";
      case "cancelled":
      case "deleted":
        return "bg-transparent text-red-600 border border-red-500 dark:text-red-400 dark:border-red-400/50";
      default:
        return "bg-transparent text-gray-600 border border-gray-400 dark:text-gray-400 dark:border-gray-400/50";
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
