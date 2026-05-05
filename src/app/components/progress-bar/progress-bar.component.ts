/* sys lib */
import { Component, Input, computed, inject, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";

/* services */
import { DataService } from "@services/data/data.service";

/* helpers */
import { BaseItemHelper } from "@helpers/base-item.helper";

export interface ProgressBarSegment {
  status: string;
  percentage: number;
  color: string;
}

@Component({
  selector: "app-progress-bar",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./progress-bar.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgressBarComponent {
  @Input() items: Array<{ status: string }> = [];
  @Input() size: "sm" | "md" | "lg" = "md";
  @Input() showLabel = true;
  @Input() showPercentage = true;
  @Input() showLegend = false;

  // Count-based inputs (alternative to items)
  @Input() completedCount?: number;
  @Input() totalCount?: number;

  // Task ID for count-based progress (uses task's subtasks_count/completed_subtasks_count)
  @Input() taskId?: string;

  private readonly dataService = inject(DataService);

  segments = computed(() => {
    if (this.items && this.items.length > 0) {
      return BaseItemHelper.getProgressSegments(this.items ?? []);
    }
    if (this.taskId) {
      const tasks = this.dataService.getCurrentTasks();
      const task = tasks.find((t) => t.id === this.taskId);
      if (task) {
        const total = task.subtasks_count || 0;
        const completed = task.completed_subtasks_count || 0;
        if (total === 0) return [];
        const remaining = total - completed;
        return [
          {
            status: "completed",
            percentage: Math.round((completed / total) * 100),
            color: "bg-green-500",
          },
          {
            status: "pending",
            percentage: Math.round((remaining / total) * 100),
            color: "bg-blue-500",
          },
        ];
      }
    }
    if (this.totalCount !== undefined && this.completedCount !== undefined) {
      const total = this.totalCount || 0;
      const completed = this.completedCount || 0;
      if (total === 0) return [];
      const remaining = total - completed;
      return [
        {
          status: "completed",
          percentage: Math.round((completed / total) * 100),
          color: "bg-green-500",
        },
        {
          status: "pending",
          percentage: Math.round((remaining / total) * 100),
          color: "bg-blue-500",
        },
      ];
    }
    return [];
  });

  totalProgress = computed(() => {
    if (this.items && this.items.length > 0) {
      const items = this.items ?? [];
      const total = items.length;
      if (total === 0) return 0;
      const completed = BaseItemHelper.countCompleted(items);
      return Math.round((completed / total) * 100);
    }
    if (this.totalCount !== undefined && this.completedCount !== undefined) {
      const total = this.totalCount || 0;
      if (total === 0) return 0;
      return Math.round((this.completedCount! / total) * 100);
    }
    return 0;
  });

  get heightClass(): string {
    switch (this.size) {
      case "sm":
        return "h-1";
      case "lg":
        return "h-3";
      case "md":
      default:
        return "h-2";
    }
  }
}
