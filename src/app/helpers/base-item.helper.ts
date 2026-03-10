/* sys lib */
import { Injectable } from "@angular/core";

/* models */
import { TaskStatus } from "@models/task.model";

/* helpers */
import { formatDateShort } from "./date-conversion.helper";

/**
 * Base helper for item components (Task, Subtask, Todo)
 * Provides common methods for status/priority handling
 */
@Injectable({
  providedIn: "root",
})
export class BaseItemHelper {
  /**
   * Get status color class
   */
  getStatusColor(status: string): string {
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
   * Get status icon
   */
  getStatusIcon(status: string): string {
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
  getPriorityColor(priority: string): string {
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
  getPriorityBadgeClass(priority: string): string {
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
  calculateProgress(completed: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((completed / total) * 100);
  }

  /**
   * Count completed items
   */
  countCompleted<T extends { status: string }>(items: T[]): number {
    return items.filter(
      (item) => item.status === TaskStatus.COMPLETED || item.status === TaskStatus.SKIPPED
    ).length;
  }

  /**
   * Format date string
   */
  formatDate = formatDateShort;

  /**
   * Check if item is blocked by dependencies
   */
  isBlockedByDependencies(
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
   * Count unread comments for a list of comments
   */
  countUnreadComments(comments: any[] | undefined, userId: string | null): number {
    if (!comments || !userId) return 0;
    return comments.filter((c) => !c.readBy || !c.readBy.includes(userId)).length;
  }

  /**
   * Count unread comments for a subtask
   */
  countSubtaskUnreadComments(subtask: any, userId: string | null): number {
    return this.countUnreadComments(subtask?.comments, userId);
  }

  /**
   * Count unread comments for a task (including its subtasks)
   */
  countTaskUnreadComments(task: any, userId: string | null): number {
    if (!task || !userId) return 0;

    let count = this.countUnreadComments(task.comments, userId);

    if (task.subtasks) {
      task.subtasks.forEach((subtask: any) => {
        count += this.countSubtaskUnreadComments(subtask, userId);
      });
    }

    return count;
  }

  /**
   * Count unread comments for a todo (including its tasks and subtasks)
   */
  countTodoUnreadComments(todo: any, userId: string | null): number {
    if (!todo || !userId) return 0;

    let count = 0;
    const tasks = todo.tasks || [];

    tasks.forEach((task: any) => {
      count += this.countTaskUnreadComments(task, userId);
    });

    return count;
  }

  /**
   * Get progress segments for progress bar
   */
  getProgressSegments(items: Array<{ status: string }>): Array<{
    status: string;
    percentage: number;
    color: string;
  }> {
    const total = items.length;

    if (total === 0) {
      return [{ status: TaskStatus.PENDING, percentage: 100, color: "bg-gray-400" }];
    }

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
