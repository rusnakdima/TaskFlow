import { Component, Input, Output, EventEmitter } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { TaskStatus } from "@models/task.model";

@Component({
  selector: "app-status-toggle",
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: "./status-toggle.component.html",
})
export class StatusToggleComponent {
  @Input() status: TaskStatus | string = TaskStatus.PENDING;
  @Input() size: "sm" | "md" | "lg" = "md";
  @Output() toggle = new EventEmitter<TaskStatus>();

  TaskStatus = TaskStatus;

  getIcon(): string {
    switch (this.status) {
      case TaskStatus.COMPLETED:
      case "completed":
        return "check_circle";
      case TaskStatus.SKIPPED:
      case "skipped":
        return "cancel";
      case TaskStatus.FAILED:
      case "failed":
        return "dangerous";
      default:
        return "radio_button_unchecked";
    }
  }

  getButtonClass(): string {
    const sizeClass =
      this.size === "sm" ? "!text-lg!" : this.size === "lg" ? "!text-3xl!" : "!text-2xl!";
    switch (this.status) {
      case TaskStatus.COMPLETED:
      case "completed":
        return `${sizeClass} text-green-600! hover:bg-green-50! dark:text-green-400! dark:hover:bg-green-900/30!`;
      case TaskStatus.SKIPPED:
      case "skipped":
        return `${sizeClass} text-orange-600! hover:bg-orange-50! dark:text-orange-400! dark:hover:bg-orange-900/30!`;
      case TaskStatus.FAILED:
      case "failed":
        return `${sizeClass} text-red-600! hover:bg-red-50! dark:text-red-400! dark:hover:bg-red-900/30!`;
      default:
        return `${sizeClass} text-gray-400! hover:bg-gray-100! dark:text-gray-500! dark:hover:bg-gray-700!`;
    }
  }

  getTitle(): string {
    switch (this.status) {
      case TaskStatus.COMPLETED:
      case "completed":
        return "Mark as pending";
      case TaskStatus.SKIPPED:
      case "skipped":
        return "Mark as pending";
      case TaskStatus.FAILED:
      case "failed":
        return "Mark as pending";
      default:
        return "Mark as completed";
    }
  }

  onToggle(): void {
    const currentStatus = this.status as TaskStatus;
    if (currentStatus === TaskStatus.PENDING || this.status === "pending") {
      this.toggle.emit(TaskStatus.COMPLETED);
    } else {
      this.toggle.emit(TaskStatus.PENDING);
    }
  }
}
