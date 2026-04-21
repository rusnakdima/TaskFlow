/* sys lib */

/* models */
import { Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";

/* helpers */
import { DateHelper } from "./date-helpers";

/**
 * Base helper for item components (Task, Subtask, Todo)
 * Provides common methods for status/priority handling
 */
export class BaseItemHelper {
  /**
   * Get status color class
   */
  static getStatusColor(status: string): string {
    switch (status) {
      case TaskStatus.COMPLETED:
        return "text-green-600 dark:text-green-400";
      case TaskStatus.SKIPPED:
        return "text-orange-600 dark:text-orange-400";
      case TaskStatus.FAILED:
        return "text-red-600 dark:text-red-400";
      case TaskStatus.PENDING:
      default:
        return "text-gray-400";
    }
  }

  /**
   * Get column color class based on status (Kanban specific)
   */
  static getColumnColorClass(status: string): string {
    switch (status) {
      case TaskStatus.PENDING:
        return "bg-linear-to-r from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700";
      case TaskStatus.COMPLETED:
        return "bg-linear-to-r from-green-500 to-green-600 dark:from-green-600 dark:to-green-700";
      case TaskStatus.SKIPPED:
        return "bg-linear-to-r from-yellow-500 to-yellow-600 dark:from-yellow-600 dark:to-yellow-700";
      case TaskStatus.FAILED:
        return "bg-linear-to-r from-red-500 to-red-600 dark:from-red-600 dark:to-red-700";
      default:
        return "bg-linear-to-r from-gray-500 to-gray-600 dark:from-gray-600 dark:to-gray-700";
    }
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
    switch (status) {
      case TaskStatus.COMPLETED:
        return "check_circle";
      case TaskStatus.SKIPPED:
        return "cancel";
      case TaskStatus.FAILED:
        return "dangerous";
      case TaskStatus.PENDING:
      default:
        return "radio_button_unchecked";
    }
  }

  /**
   * Get priority color class
   */
  static getPriorityColor(priority: string): string {
    switch (priority.toLowerCase()) {
      case "urgent":
        return "text-purple-600 dark:text-purple-400";
      case "high":
        return "text-red-600 dark:text-red-400";
      case "medium":
        return "text-yellow-600 dark:text-yellow-400";
      case "low":
        return "text-blue-600 dark:text-blue-400";
      default:
        return "text-gray-600 dark:text-gray-400";
    }
  }

  /**
   * Get priority badge class
   */
  static getPriorityBadgeClass(priority: string): string {
    switch (priority.toLowerCase()) {
      case "urgent":
        return "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300";
      case "high":
        return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300";
      case "medium":
        return "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300";
      case "low":
        return "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300";
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
   * Format date string
   */
  static formatDate = DateHelper.formatDateShort;

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
   * Count unread comments for an entity (task or subtask)
   * Only counts non-deleted comments that haven't been read by the user
   */
  static countUnreadComments(
    entity: any,
    userId: string | null,
    entityType: "task" | "subtask" = "task"
  ): number {
    if (!entity || !userId) return 0;

    let count = 0;

    // Count direct comments on this entity
    if (entity.comments && entity.comments.length > 0) {
      count += entity.comments.filter((c: any) => {
        // Skip deleted comments
        if (c.deletedAt) return false;
        // Skip if user has read the comment
        if (c.readBy && c.readBy.includes(userId)) return false;
        // For tasks, only count task comments (not subtask comments)
        if (entityType === "task" && c.subtaskId) return false;
        // For subtasks, only count subtask comments
        if (entityType === "subtask" && !c.subtaskId) return false;
        return true;
      }).length;
    }

    return count;
  }

  /**
   * Mark all comments as read for a task or subtask
   */
  static markCommentsAsRead(
    entity: any,
    userId: string,
    entityType: "task" | "subtask" = "task"
  ): any[] {
    if (!entity || !entity.comments || !userId) return entity.comments || [];
    if (entity.comments.length === 0) return entity.comments;

    return entity.comments.map((comment: any) => {
      // Skip deleted comments
      if (comment.deletedAt) return comment;

      // For tasks, only mark task comments (not subtask comments)
      if (entityType === "task" && comment.subtaskId) return comment;
      // For subtasks, only mark subtask comments
      if (entityType === "subtask" && !comment.subtaskId) return comment;

      // Mark as read if not already
      if (!comment.readBy || !comment.readBy.includes(userId)) {
        return {
          ...comment,
          readBy: [...(comment.readBy || []), userId],
        };
      }
      return comment;
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
    // Handle undefined or null items
    if (!items || items.length === 0) {
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
