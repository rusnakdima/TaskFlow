/* sys lib */
import { Component, Input, Output, EventEmitter } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";

/* models */
import { TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";

/* helpers */
import { DateHelper } from "@helpers/date.helper";
import { PRIORITY_COLORS, STATUS_ICONS } from "@constants/table-field.constants";

/* components */
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

@Component({
  selector: "app-kanban-subtask-card",
  standalone: true,
  imports: [CommonModule, MatIconModule, CheckboxComponent],
  templateUrl: "./kanban-subtask-card.component.html",
})
export class KanbanSubtaskCardComponent {
  @Input() subtask!: Subtask;
  @Input() todo_id: string = "";
  @Input() isSelected: boolean = false;

  @Output() statusCycle = new EventEmitter<Subtask>();
  @Output() selectionChange = new EventEmitter<boolean>();
  @Output() cardClick = new EventEmitter<Subtask>();

  TaskStatus = TaskStatus;

  getPriorityDotColor(priority: string): string {
    const p = (priority || "medium").toLowerCase();
    switch (p) {
      case "high":
        return "bg-red-600 dark:bg-red-500";
      case "medium":
        return "bg-yellow-500 dark:bg-yellow-400";
      case "low":
        return "bg-green-600 dark:bg-green-500";
      default:
        return "bg-yellow-500 dark:bg-yellow-400";
    }
  }

  getPriorityBorderColor(priority: string): string {
    const p = (priority || "medium").toLowerCase();
    switch (p) {
      case "high":
        return "border-red-600 dark:border-red-500 border-l-4 border-l-red-700 dark:border-l-red-500";
      case "medium":
        return "border-yellow-500 dark:border-yellow-400 border-l-4 border-l-yellow-600 dark:border-l-yellow-500";
      case "low":
        return "border-green-600 dark:border-green-500 border-l-4 border-l-green-700 dark:border-l-green-500";
      default:
        return "border-yellow-500 dark:border-yellow-400 border-l-4 border-l-yellow-600 dark:border-l-yellow-500";
    }
  }

  getPriorityBgColor(priority: string): string {
    return PRIORITY_COLORS[priority as keyof typeof PRIORITY_COLORS] || PRIORITY_COLORS.medium;
  }

  getStatusBorderColor(status: string): string {
    switch (status) {
      case TaskStatus.COMPLETED:
        return "border-l-4 border-l-blue-500";
      case TaskStatus.SKIPPED:
        return "border-l-4 border-l-orange-500";
      case TaskStatus.FAILED:
        return "border-l-4 border-l-red-500";
      case TaskStatus.PENDING:
      default:
        return "border-l-4 border-l-gray-400";
    }
  }

  getStatusIcon(status: string): string {
    return STATUS_ICONS[status as keyof typeof STATUS_ICONS] || STATUS_ICONS[TaskStatus.PENDING];
  }

  getStatusColorClass(status: string): string {
    switch (status) {
      case TaskStatus.COMPLETED:
        return "text-blue-500 dark:text-blue-400";
      case TaskStatus.SKIPPED:
        return "text-orange-500 dark:text-orange-400";
      case TaskStatus.FAILED:
        return "text-red-500 dark:text-red-400";
      case TaskStatus.PENDING:
      default:
        return "text-gray-400 dark:text-gray-500";
    }
  }

  formatDate = DateHelper.formatDateShort;

  onStatusCycleClick(event: MouseEvent): void {
    event.stopPropagation();
    this.statusCycle.emit(this.subtask);
  }

  onCheckboxChange(checked: boolean): void {
    this.selectionChange.emit(checked);
  }

  onCardClick(_event: MouseEvent): void {
    this.cardClick.emit(this.subtask);
  }

  onDragHandleClick(event: MouseEvent): void {
    event.stopPropagation();
  }
}
