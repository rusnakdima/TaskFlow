import { Injectable, inject, signal } from "@angular/core";
import { CdkDragDrop } from "@angular/cdk/drag-drop";
import { Subtask } from "@models/subtask.model";
import { TaskStatus } from "@models/task.model";
import { Todo } from "@models/todo.model";
import { BaseItemHelper } from "@helpers/base-item.helper";
import { REQUEST_SERVICE, Visibility } from "@services/api.service";
import { NotifyService } from "@services/notifications/notify.service";
import { KanbanDragDropService } from "@services/ui/kanban-drag-drop.service";
import { STATUS_ICONS } from "@constants/table-field.constants";

export interface SubtaskKanbanColumn {
  id: TaskStatus;
  label: string;
  color: string;
  icon: string;
  iconBgClass: string;
}

@Injectable({ providedIn: "root" })
export class SubtasksKanbanHelper {
  private requestService = inject(REQUEST_SERVICE);
  private notifyService = inject(NotifyService);
  private kanbanDragDropService = inject(KanbanDragDropService);

  private _isUpdatingKanban = signal(false);

  getColumnColorClass = BaseItemHelper.getColumnColorClass;

  getKanbanColumns(): SubtaskKanbanColumn[] {
    return [
      {
        id: TaskStatus.PENDING,
        label: "To Do",
        color: "bg-yellow-500",
        icon: STATUS_ICONS[TaskStatus.PENDING],
        iconBgClass: "bg-yellow-500/20 text-yellow-400",
      },
      {
        id: TaskStatus.COMPLETED,
        label: "Done",
        color: "bg-green-500",
        icon: STATUS_ICONS[TaskStatus.COMPLETED],
        iconBgClass: "bg-green-500/20 text-green-400",
      },
      {
        id: TaskStatus.SKIPPED,
        label: "Skipped",
        color: "bg-orange-500",
        icon: STATUS_ICONS[TaskStatus.SKIPPED],
        iconBgClass: "bg-orange-500/20 text-orange-400",
      },
      {
        id: TaskStatus.FAILED,
        label: "Failed",
        color: "bg-red-500",
        icon: STATUS_ICONS[TaskStatus.FAILED],
        iconBgClass: "bg-red-500/20 text-red-400",
      },
    ];
  }

  getSubtasksByStatus(subtasks: Subtask[], status: TaskStatus): Subtask[] {
    return subtasks.filter((s) => s.status === status);
  }

  getConnectedKanbanDropLists(currentStatus: TaskStatus): string[] {
    return this.kanbanDragDropService.getConnectedDropLists(
      currentStatus,
      this.getKanbanColumns() as any
    );
  }

  onKanbanSubtaskDrop(
    event: CdkDragDrop<Subtask[]>,
    targetStatus: TaskStatus,
    _todo: Todo | null,
    updateSubtaskFn: (subtaskId: string, newStatus: TaskStatus) => void
  ): void {
    this.kanbanDragDropService.handleKanbanDrop<Subtask>(
      event as any,
      targetStatus,
      this._isUpdatingKanban(),
      (newStatus, subtaskId) => {
        if (subtaskId) {
          updateSubtaskFn(subtaskId, newStatus);
        }
      }
    );
  }

  onKanbanStatusCycle(
    subtask: Subtask,
    updateSubtaskFn: (subtaskId: string, newStatus: TaskStatus) => void
  ): void {
    const newStatus = BaseItemHelper.getNextStatus(subtask.status);
    updateSubtaskFn(subtask.id, newStatus);
  }

  onKanbanSelectionChange(
    subtaskId: string,
    isSelected: boolean,
    toggleSubtaskSelectionFn: (event: { id: string; selected: boolean }) => void
  ): void {
    toggleSubtaskSelectionFn({ id: subtaskId, selected: isSelected });
  }

  isKanbanSubtaskSelected(subtaskId: string, selectedSubtasks: Set<string>): boolean {
    return selectedSubtasks.has(subtaskId);
  }

  updateSubtaskStatus(
    subtaskId: string,
    newStatus: TaskStatus,
    todo: Todo | null,
    updateSubtasksFn: (updateFn: (subtasks: Subtask[]) => Subtask[]) => void
  ): void {
    if (this._isUpdatingKanban()) {
      this.notifyService.showWarning("Please wait for previous operation to complete");
      return;
    }

    this._isUpdatingKanban.set(true);

    const visibility = todo?.visibility || "private";

    this.requestService
      .update<Subtask>(
        "subtasks",
        subtaskId,
        { status: newStatus },
        { visibility: visibility as Visibility }
      )
      .subscribe({
        next: () => {
          updateSubtasksFn((subtasks) =>
            subtasks.map((s) => (s.id === subtaskId ? { ...s, status: newStatus } : s))
          );
          this._isUpdatingKanban.set(false);
          this.notifyService.showSuccess(`Subtask moved to ${newStatus}`);
        },
        error: (err) => {
          this._isUpdatingKanban.set(false);
          this.notifyService.showError(err.message || "Failed to update subtask");
        },
      });
  }
}
