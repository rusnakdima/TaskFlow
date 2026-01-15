/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output, signal } from "@angular/core";
import { RouterModule } from "@angular/router";
import { FormsModule } from "@angular/forms";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { DragDropModule } from "@angular/cdk/drag-drop";

/* helpers */
import { Common } from "@helpers/common.helper";

/* models */
import { Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";

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
  @Input() isOwner: boolean = true;
  @Input() isPrivate: boolean = true;

  @Output() deleteTaskEvent: EventEmitter<string> = new EventEmitter();
  @Output() toggleCompletionEvent: EventEmitter<Task> = new EventEmitter();
  @Output() updateTaskEvent: EventEmitter<{ task: Task; field: string; value: string }> =
    new EventEmitter();

  editingField = signal<string | null>(null);
  editingValue = signal("");

  truncateString = Common.truncateString;

  get countCompletedTasks(): number {
    const listSubtasks = this.task?.subtasks ?? [];
    const listCompletedSubtasks = listSubtasks.filter(
      (subtask: Subtask) =>
        subtask.status === TaskStatus.COMPLETED || subtask.status === TaskStatus.SKIPPED
    );
    return listCompletedSubtasks.length;
  }

  get countTasks(): number {
    const listSubtasks = this.task?.subtasks ?? [];
    return listSubtasks.length;
  }

  get percentCompletedSubTasks(): number {
    const listSubtasks = this.task?.subtasks ?? [];
    const listCompletedSubtasks = listSubtasks.filter(
      (subtask: Subtask) =>
        subtask.status === TaskStatus.COMPLETED || subtask.status === TaskStatus.SKIPPED
    );
    const percent =
      listCompletedSubtasks.length / (listSubtasks.length == 0 ? 1 : listSubtasks.length);
    return percent;
  }

  getProgressPercentage(): number {
    if (this.task?.status === TaskStatus.COMPLETED || this.task?.status === TaskStatus.SKIPPED)
      return 100;
    return Math.round(this.percentCompletedSubTasks * 100);
  }

  getProgressSegments(): { status: TaskStatus; percentage: number; color: string }[] {
    const listSubtasks = this.task?.subtasks ?? [];
    const total = listSubtasks.length;

    if (total === 0) {
      const taskStatus = this.task?.status || TaskStatus.PENDING;
      let color = "bg-gray-400";
      switch (taskStatus) {
        case TaskStatus.COMPLETED:
          color = "bg-green-500";
          break;
        case TaskStatus.SKIPPED:
          color = "bg-orange-500";
          break;
        case TaskStatus.FAILED:
          color = "bg-red-500";
          break;
        case TaskStatus.PENDING:
        default:
          color = "bg-gray-400";
          break;
      }
      return [{ status: taskStatus, percentage: 100, color }];
    }

    const completed = listSubtasks.filter((s) => s.status === TaskStatus.COMPLETED).length;
    const skipped = listSubtasks.filter((s) => s.status === TaskStatus.SKIPPED).length;
    const failed = listSubtasks.filter((s) => s.status === TaskStatus.FAILED).length;
    const pending = listSubtasks.filter((s) => s.status === TaskStatus.PENDING).length;

    const segments = [];

    if (completed > 0) {
      segments.push({
        status: TaskStatus.COMPLETED,
        percentage: Math.round((completed / total) * 100),
        color: "bg-green-500",
      });
    }
    if (skipped > 0) {
      segments.push({
        status: TaskStatus.SKIPPED,
        percentage: Math.round((skipped / total) * 100),
        color: "bg-orange-500",
      });
    }
    if (failed > 0) {
      segments.push({
        status: TaskStatus.FAILED,
        percentage: Math.round((failed / total) * 100),
        color: "bg-red-500",
      });
    }
    if (pending > 0) {
      segments.push({
        status: TaskStatus.PENDING,
        percentage: Math.round((pending / total) * 100),
        color: "bg-gray-400",
      });
    }

    return segments;
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
    this.editingField.set(field);
    this.editingValue.set(currentValue);

    setTimeout(() => {
      const input = document.querySelector("input:focus, textarea:focus") as HTMLInputElement;
      if (input) {
        input.select();
      }
    }, 0);
  }

  saveInlineEdit() {
    if (this.editingValue().trim() && this.editingField() && this.task) {
      const originalValue =
        this.editingField() === "title" ? this.task.title : this.task.description;
      if (this.editingValue().trim() !== originalValue) {
        this.updateTaskEvent.emit({
          task: this.task,
          field: this.editingField()!,
          value: this.editingValue().trim(),
        });
      }
    }
    this.cancelInlineEdit();
  }

  cancelInlineEdit() {
    this.editingField.set(null);
    this.editingValue.set("");
  }

  deleteTask() {
    if (this.task) {
      this.deleteTaskEvent.emit(this.task.id);
    }
  }
}
