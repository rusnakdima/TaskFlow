/* sys lib */
import { Component, Input, computed, inject, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";

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

  segments = computed(() => BaseItemHelper.getProgressSegments(this.items ?? []));

  totalProgress = computed(() => {
    const items = this.items ?? [];
    const total = items.length;
    if (total === 0) return 0;
    const completed = BaseItemHelper.countCompleted(items);
    return Math.round((completed / total) * 100);
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
