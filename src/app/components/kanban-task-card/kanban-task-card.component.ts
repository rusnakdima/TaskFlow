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
import { StatusToggleComponent } from "@components/status-toggle/status-toggle.component";

/* helpers */
import { BaseItemHelper } from "@helpers/base-item.helper";
import { DateHelper } from "@helpers/date.helper";
import { PRIORITY_COLORS, STATUS_COLORS, ActionColors } from "@constants/table-field.constants";

@Component({
  selector: "app-kanban-task-card",
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    DragDropModule,
    MatIconModule,
    ProgressBarComponent,
    StatusToggleComponent,
  ],
  templateUrl: "./kanban-task-card.component.html",
})
export class KanbanTaskCardComponent {
  @Input() task!: Task;
  @Input() columnId!: string;
  @Input() columns: { id: string; label: string; icon: string }[] = [];
  @Input() subtasks: Subtask[] = [];
  @Input() isExpanded = false;
  @Input() todo_id = "";

  @Output() toggleExpand = new EventEmitter<Task>();
  @Output() toggleStatus = new EventEmitter<Task>();
  @Output() moveTaskEvent = new EventEmitter<{ taskId: string; newStatus: TaskStatus }>();
  @Output() toggleSubtaskCompletion = new EventEmitter<Subtask>();

  TaskStatus = TaskStatus;

  getPriorityBgColor(priority: string): string {
    return PRIORITY_COLORS[priority as keyof typeof PRIORITY_COLORS] || PRIORITY_COLORS.medium;
  }

  toggleExpandTask(): void {
    this.toggleExpand.emit(this.task);
  }

  moveTask(targetColId: string): void {
    this.moveTaskEvent.emit({ taskId: this.task.id, newStatus: targetColId as TaskStatus });
  }

  onStatusToggle(newStatus: TaskStatus): void {
    this.toggleStatus.emit(this.task);
  }

  onSubtaskToggleCompletion(subtask: Subtask): void {
    this.toggleSubtaskCompletion.emit(subtask);
  }

  getTotalSubtasksCount(): number {
    return this.subtasks.length;
  }

  getCompletedSubtasksCount(): number {
    return BaseItemHelper.countCompleted(this.subtasks);
  }

  getStatusColorClass(status: string): string {
    return STATUS_COLORS[status as keyof typeof STATUS_COLORS] || STATUS_COLORS[TaskStatus.PENDING];
  }

  formatDate = DateHelper.formatDateShort;

  getActionColor(action: string): string {
    const colorKey = action as keyof typeof ActionColors;
    const baseClass = "rounded p-1.5 transition-colors";
    return `${baseClass} ${ActionColors[colorKey] || ActionColors.default}`;
  }
}
