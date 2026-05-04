/* sys lib */
import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* helpers */
import { BaseItemHelper } from "@helpers/base-item.helper";

@Component({
  selector: "app-status-toggle",
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: "./status-toggle.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusToggleComponent {
  @Input() status: string = "pending";
  @Input() itemType: "task" | "subtask" = "task";
  @Output() statusChange = new EventEmitter<string>();

  get icon(): string {
    return BaseItemHelper.getStatusIcon(this.status);
  }

  get buttonClasses(): string {
    switch (this.status) {
      case "completed":
        return "bg-green-100 text-green-600 hover:bg-green-200 dark:bg-green-900/40 dark:hover:bg-green-900/60";
      case "skipped":
        return "bg-orange-100 text-orange-600 hover:bg-orange-200 dark:bg-orange-900/40 dark:hover:bg-orange-900/60";
      case "failed":
        return "bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-900/60";
      default:
        return "bg-blue-100 text-blue-500 hover:bg-blue-200 dark:bg-blue-900/40 dark:hover:bg-blue-900/60";
    }
  }

  get buttonSizeClass(): string {
    return this.itemType === "task" ? "h-8 w-8" : "h-7 w-7";
  }

  get iconSizeClass(): string {
    return this.itemType === "task" ? "h-5! w-5! min-w-5 text-xl!" : "h-5! w-5! min-w-5 text-xl!";
  }

  get title(): string {
    switch (this.status) {
      case "completed":
        return "Mark as skipped";
      case "skipped":
        return "Mark as failed";
      case "failed":
        return "Mark as pending";
      default:
        return "Mark as completed";
    }
  }

  onClick(event: Event): void {
    event.stopPropagation();
    const nextStatus = BaseItemHelper.getNextStatus(this.status as any);
    this.statusChange.emit(nextStatus);
  }
}
