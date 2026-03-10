/* sys lib */
import { Component, Input, Output, EventEmitter, signal, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { DragDropModule } from "@angular/cdk/drag-drop";
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";

/* components */
import { ProgressBarComponent } from "@components/progress-bar/progress-bar.component";

/* helpers */
import { BaseItemHelper } from "@helpers/base-item.helper";

@Component({
  selector: "app-kanban-task-card",
  standalone: true,
  imports: [CommonModule, RouterModule, DragDropModule, MatIconModule, ProgressBarComponent],
  templateUrl: "./kanban-task-card.component.html",
})
export class KanbanTaskCardComponent {
  private baseHelper = inject(BaseItemHelper);

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
    return this.baseHelper.countCompleted(this.subtasks);
  }

  formatDate = this.baseHelper.formatDate;
}
