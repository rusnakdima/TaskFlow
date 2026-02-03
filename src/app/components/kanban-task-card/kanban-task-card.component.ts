/* sys lib */
import { Component, Input, Output, EventEmitter, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { DragDropModule } from "@angular/cdk/drag-drop";
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";

@Component({
  selector: "app-kanban-task-card",
  standalone: true,
  imports: [CommonModule, RouterModule, DragDropModule, MatIconModule],
  templateUrl: "./kanban-task-card.component.html",
})
export class KanbanTaskCardComponent {
  @Input() task!: Task;
  @Input() columnId!: string;
  @Input() columns: { id: string; label: string; icon: string }[] = [];
  @Input() subtasks: Subtask[] = [];
  @Input() isExpanded = false;
  @Input() todoId = "";

  @Output() toggleExpand = new EventEmitter<Task>();
  @Output() moveTaskEvent = new EventEmitter<{ taskId: string; newStatus: TaskStatus }>();
  @Output() toggleSubtaskCompletion = new EventEmitter<Subtask>();

  TaskStatus = TaskStatus;

  toggleExpandTask(): void {
    this.toggleExpand.emit(this.task);
  }

  moveTask(targetColId: string): void {
    this.moveTaskEvent.emit({ taskId: this.task.id, newStatus: targetColId as TaskStatus });
  }

  onSubtaskToggleCompletion(subtask: Subtask): void {
    this.toggleSubtaskCompletion.emit(subtask);
  }

  getSubtasksForTask(): Subtask[] {
    return this.subtasks;
  }

  getTotalSubtasksCount(): number {
    return this.subtasks.length;
  }

  getCompletedSubtasksCount(): number {
    return this.subtasks.filter(
      (s) => s.status === TaskStatus.COMPLETED || s.status === TaskStatus.SKIPPED
    ).length;
  }

  getTaskProgressPercentage(): number {
    const subtasks = this.subtasks;
    if (subtasks.length === 0) {
      return this.task.status === TaskStatus.COMPLETED || this.task.status === TaskStatus.SKIPPED
        ? 100
        : 0;
    }
    const completed = subtasks.filter(
      (s) => s.status === TaskStatus.COMPLETED || s.status === TaskStatus.SKIPPED
    ).length;
    return Math.round((completed / subtasks.length) * 100);
  }

  getTaskProgressSegments(): { status: TaskStatus; percentage: number; color: string }[] {
    const subtasks = this.subtasks;
    const total = subtasks.length;

    if (total === 0) {
      const taskStatus = this.task.status || TaskStatus.PENDING;
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

    const completed = subtasks.filter((s) => s.status === TaskStatus.COMPLETED).length;
    const skipped = subtasks.filter((s) => s.status === TaskStatus.SKIPPED).length;
    const failed = subtasks.filter((s) => s.status === TaskStatus.FAILED).length;
    const pending = subtasks.filter((s) => s.status === TaskStatus.PENDING).length;

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

  formatDate(dateString: string): string {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }
}
