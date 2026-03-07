/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output, signal } from "@angular/core";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatChipsModule } from "@angular/material/chips";
import { MatCardModule } from "@angular/material/card";

/* models */
import { Subtask } from "@models/subtask.model";
import { TaskStatus, PriorityTask } from "@models/task.model";

/* components */
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

@Component({
  selector: "app-subtask-records",
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatChipsModule,
    MatCardModule,
    CheckboxComponent,
  ],
  templateUrl: "./subtask-records.component.html",
})
export class SubtaskRecordsComponent {
  @Input() subtasks: Subtask[] = [];
  @Input() selectedRecords = new Set<string>();
  @Output() selectRecord = new EventEmitter<string>();
  @Output() deleteRecord = new EventEmitter<Subtask>();
  @Output() toggleDelete = new EventEmitter<Subtask>();

  expandedRecords = signal<Set<string>>(new Set());

  toggleExpanded(recordId: string): void {
    this.expandedRecords.update((expanded) => {
      const newExpanded = new Set(expanded);
      if (newExpanded.has(recordId)) {
        newExpanded.delete(recordId);
      } else {
        newExpanded.add(recordId);
      }
      return newExpanded;
    });
  }

  isExpanded(recordId: string): boolean {
    return this.expandedRecords().has(recordId);
  }

  isSelected(recordId: string): boolean {
    return this.selectedRecords.has(recordId);
  }

  onSelectChange(recordId: string): void {
    this.selectRecord.emit(recordId);
  }

  onDeleteRecord(subtask: Subtask): void {
    this.deleteRecord.emit(subtask);
  }

  onToggleDelete(subtask: Subtask): void {
    this.toggleDelete.emit(subtask);
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      return date.toLocaleString();
    } catch {
      return dateStr;
    }
  }

  getStatusColor(status: TaskStatus): string {
    switch (status) {
      case TaskStatus.COMPLETED:
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
      case TaskStatus.SKIPPED:
        return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300";
      case TaskStatus.FAILED:
        return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
      case TaskStatus.PENDING:
      default:
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
    }
  }

  getPriorityColor(priority: PriorityTask): string {
    switch (priority) {
      case PriorityTask.HIGH:
        return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
      case PriorityTask.MEDIUM:
        return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300";
      case PriorityTask.LOW:
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
      default:
        return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300";
    }
  }

  getStatusText(status: TaskStatus): string {
    switch (status) {
      case TaskStatus.COMPLETED:
        return "Completed";
      case TaskStatus.SKIPPED:
        return "Skipped";
      case TaskStatus.FAILED:
        return "Failed";
      case TaskStatus.PENDING:
        return "In Progress";
      default:
        return status || "In Progress";
    }
  }

  getPriorityText(priority: PriorityTask): string {
    switch (priority) {
      case PriorityTask.HIGH:
        return "High";
      case PriorityTask.MEDIUM:
        return "Medium";
      case PriorityTask.LOW:
        return "Low";
      default:
        return priority;
    }
  }

  getDeletedStatusColor(isDeleted: boolean): string {
    return isDeleted
      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
      : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
  }

  getDeletedStatusText(isDeleted: boolean): string {
    return isDeleted ? "Deleted" : "Active";
  }
}
