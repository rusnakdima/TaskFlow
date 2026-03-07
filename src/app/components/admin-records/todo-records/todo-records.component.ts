/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output, signal } from "@angular/core";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatChipsModule } from "@angular/material/chips";
import { MatCardModule } from "@angular/material/card";

/* models */
import { Todo } from "@models/todo.model";

/* components */
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

@Component({
  selector: "app-todo-records",
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatChipsModule,
    MatCardModule,
    CheckboxComponent,
  ],
  templateUrl: "./todo-records.component.html",
})
export class TodoRecordsComponent {
  @Input() todos: Todo[] = [];
  @Input() selectedRecords = new Set<string>();
  @Output() selectRecord = new EventEmitter<string>();
  @Output() deleteRecord = new EventEmitter<Todo>();
  @Output() toggleDelete = new EventEmitter<Todo>();

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

  onDeleteRecord(todo: Todo): void {
    this.deleteRecord.emit(todo);
  }

  onToggleDelete(todo: Todo): void {
    this.toggleDelete.emit(todo);
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

  getPriorityColor(priority: string): string {
    switch (priority?.toLowerCase()) {
      case "high":
        return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
      case "medium":
        return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300";
      case "low":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
      default:
        return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300";
    }
  }

  getStatusColor(isDeleted: boolean): string {
    return isDeleted
      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
      : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
  }

  getStatusText(isDeleted: boolean): string {
    return isDeleted ? "Deleted" : "Active";
  }
}
