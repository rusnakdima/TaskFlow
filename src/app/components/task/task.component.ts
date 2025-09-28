/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { RouterModule } from "@angular/router";
import { FormsModule } from "@angular/forms";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { DragDropModule } from "@angular/cdk/drag-drop";

/* helpers */
import { Common } from "@helpers/common.helper";

/* models */
import { Task } from "@models/task";
import { Subtask } from "@models/subtask";

@Component({
  selector: "app-task",
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, MatIconModule, DragDropModule],
  templateUrl: "./task.component.html",
})
export class TaskComponent {
  constructor() {}

  @Input() task: Task | null = null;
  @Input() index: number = 0;

  @Output() deleteTaskEvent: EventEmitter<string> = new EventEmitter();
  @Output() toggleCompletionEvent: EventEmitter<Task> = new EventEmitter();
  @Output() updateTaskEvent: EventEmitter<{ task: Task; field: string; value: string }> =
    new EventEmitter();

  editingField: string | null = null;
  editingValue: string = "";

  truncateString = Common.truncateString;

  get countCompletedTasks(): number {
    const listSubtasks = this.task?.subtasks ?? [];
    const listCompletedSubtasks = listSubtasks.filter((subtask: Subtask) => subtask.isCompleted);
    return listCompletedSubtasks.length;
  }

  get countTasks(): number {
    const listSubtasks = this.task?.subtasks ?? [];
    return listSubtasks.length;
  }

  get percentCompletedSubTasks(): number {
    const listSubtasks = this.task?.subtasks ?? [];
    const listCompletedSubtasks = listSubtasks.filter((subtask: Subtask) => subtask.isCompleted);
    const percent =
      listCompletedSubtasks.length / (listSubtasks.length == 0 ? 1 : listSubtasks.length);
    return percent;
  }

  getProgressPercentage(): number {
    if (this.task?.isCompleted) return 100;
    return Math.round(this.percentCompletedSubTasks * 100);
  }

  getPriorityColor(priority: string): string {
    switch (priority.toLowerCase()) {
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

  formatDate(dateString: string): string {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  toggleCompletion(event: any) {
    event.stopPropagation();
    if (this.task) {
      this.toggleCompletionEvent.emit(this.task);
    }
  }

  startInlineEdit(field: string, currentValue: string) {
    this.editingField = field;
    this.editingValue = currentValue;

    setTimeout(() => {
      const input = document.querySelector("input:focus, textarea:focus") as HTMLInputElement;
      if (input) {
        input.select();
      }
    }, 0);
  }

  saveInlineEdit() {
    if (this.editingValue.trim() && this.editingField && this.task) {
      const originalValue = this.editingField === "title" ? this.task.title : this.task.description;
      if (this.editingValue.trim() !== originalValue) {
        this.updateTaskEvent.emit({
          task: this.task,
          field: this.editingField,
          value: this.editingValue.trim(),
        });
      }
    }
    this.cancelInlineEdit();
  }

  cancelInlineEdit() {
    this.editingField = null;
    this.editingValue = "";
  }

  deleteTask() {
    if (this.task && confirm(`Are you sure you want to delete "${this.task.title}"?`)) {
      this.deleteTaskEvent.emit(this.task.id);
    }
  }
}
