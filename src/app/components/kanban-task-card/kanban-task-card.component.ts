/* sys lib */
import { Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Task, TaskStatus, Subtask } from "@models/generated/api.types";
import { TodoPermission } from "@services/core/permission.service";

/* helpers */
import { DateHelper } from "@helpers/date.helper";
import { BaseKanbanCardComponent } from "@components/kanban-card-base/kanban-card-base.component";

/* components */
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";
import { ProgressBarComponent } from "@components/progress-bar/progress-bar.component";

@Component({
  selector: "app-kanban-task-card",
  standalone: true,
  imports: [CommonModule, MatIconModule, CheckboxComponent, ProgressBarComponent],
  templateUrl: "./kanban-task-card.component.html",
})
export class KanbanTaskCardComponent extends BaseKanbanCardComponent {
  @Input() task!: Task;
  @Input() todo_id: string = "";
  @Input() subtasks: Subtask[] = [];
  @Input() isSelected: boolean = false;
  @Input() userPermission: TodoPermission = TodoPermission.VIEWER;

  override TaskStatus = TaskStatus;
  TodoPermission = TodoPermission;

  private readonly isAdminPermission = [TodoPermission.MODERATOR, TodoPermission.OWNER];

  isStatusToggleDisabled(): boolean {
    if (this.userPermission === TodoPermission.VIEWER) {
      return true;
    }
    if (this.isAdminPermission.includes(this.userPermission)) {
      return false;
    }
    if (this.userPermission === TodoPermission.EDITOR) {
      return false;
    }
    return true;
  }

  getSubtasksCount(): number {
    return this.subtasks.length;
  }

  getCompletedSubtasksCount(): number {
    return this.subtasks.filter(
      (s) => s.status === TaskStatus.COMPLETED || s.status === TaskStatus.SKIPPED
    ).length;
  }

  getProgressItems(): Array<{ status: string }> {
    if (this.subtasks.length > 0) return this.subtasks;
    return [{ status: this.task.status || "pending" }];
  }

  formatDate = DateHelper.formatDateShort;

  override onStatusCycleClick(event: MouseEvent): void {
    event.stopPropagation();
    this.statusCycle.emit(this.task as any);
  }

  override onCheckboxChange(checked: boolean): void {
    this.selectionChange.emit(checked);
  }

  override onCardClick(_event: MouseEvent): void {
    this.cardClick.emit(this.task as any);
  }

  override onDragHandleClick(event: MouseEvent): void {
    event.stopPropagation();
  }
}
