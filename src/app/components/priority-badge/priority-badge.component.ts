/* sys lib */
import { Component, Input, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";

/* helpers */
import { BaseItemHelper } from "@helpers/base-item.helper";

@Component({
  selector: "app-priority-badge",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./priority-badge.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriorityBadgeComponent {
  @Input() priority: string = "medium";
  @Input() size: "sm" | "md" | "lg" = "md";

  get badgeClasses(): string {
    return BaseItemHelper.getPriorityBadgeClass(this.priority);
  }

  get sizeClasses(): string {
    switch (this.size) {
      case "sm":
        return "px-1.5 py-0.5 text-[10px]";
      case "lg":
        return "px-3 py-1 text-sm";
      case "md":
      default:
        return "px-2 py-1 text-xs";
    }
  }

  get displayPriority(): string {
    return this.priority.toUpperCase();
  }
}
