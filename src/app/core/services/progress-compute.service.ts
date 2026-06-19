import { Injectable, inject } from "@angular/core";
import { TaskStatus, Task } from "@entities/generated/api.types";
import { StorageService } from "@services/storage.service";
import { BaseItemHelper } from "@helpers/base-item.helper";

export interface ProgressSegment {
  status: string;
  percentage: number;
  color: string;
}

@Injectable({ providedIn: "root" })
export class ProgressComputeService {
  private readonly storageService = inject(StorageService);

  computeProgressItems(
    items: Array<{ status: string }>,
    counts?: { completed: number; total: number },
    taskId?: string
  ): ProgressSegment[] {
    if (taskId) {
      return this.computeFromTaskId(taskId);
    }
    if (counts) {
      return this.computeFromCounts(counts.completed, counts.total);
    }
    return this.computeFromItems(items);
  }

  getCompletedCount(items: Array<{ status: string }>): number {
    return BaseItemHelper.countCompleted(items);
  }

  getTotalCount(items: Array<{ status: string }>): number {
    return Array.isArray(items) ? items.length : 0;
  }

  hasProgress(items: Array<{ status: string }>): boolean {
    return Array.isArray(items) && items.length > 0;
  }

  private computeFromItems(items: Array<{ status: string }>): ProgressSegment[] {
    return BaseItemHelper.getProgressSegments(items);
  }

  private computeFromCounts(completed: number, total: number): ProgressSegment[] {
    if (total === 0) return [];
    const remaining = total - completed;
    return [
      {
        status: TaskStatus.COMPLETED,
        percentage: Math.round((completed / total) * 100),
        color: "bg-green-500",
      },
      {
        status: TaskStatus.PENDING,
        percentage: Math.round((remaining / total) * 100),
        color: "bg-blue-500",
      },
    ];
  }

  private computeFromTaskId(taskId: string): ProgressSegment[] {
    const tasks = this.storageService.tasks();
    const task = tasks.find((t: Task) => t.id === taskId);
    if (!task) return [];
    const total = task.subtasks_count || 0;
    const completed = task.completed_subtasks_count || 0;
    return this.computeFromCounts(completed, total);
  }
}
