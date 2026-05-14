import { Injectable, inject } from "@angular/core";
import { CdkDragDrop } from "@angular/cdk/drag-drop";
import { Subtask, TaskStatus, Todo } from "@models/generated/api.types";
import { BaseKanbanHelper, KanbanColumn } from "@helpers/base-kanban.helper";
import { ApiService, Visibility } from "@services/api.service";

export interface SubtaskKanbanColumn extends KanbanColumn {}

@Injectable({ providedIn: "root" })
export class SubtasksKanbanHelper extends BaseKanbanHelper<Subtask> {
  private requestService = inject(ApiService);

  getEntityName(): string {
    return "subtask";
  }

  getKanbanColumns(): SubtaskKanbanColumn[] {
    return [
      {
        id: TaskStatus.PENDING,
        label: "To Do",
        color: "bg-yellow-500",
        icon: "radio_button_unchecked",
        iconBgClass: "bg-yellow-500/20 text-yellow-400",
      },
      {
        id: TaskStatus.COMPLETED,
        label: "Done",
        color: "bg-green-500",
        icon: "check_circle",
        iconBgClass: "bg-green-500/20 text-green-400",
      },
      {
        id: TaskStatus.SKIPPED,
        label: "Skipped",
        color: "bg-orange-500",
        icon: "cancel",
        iconBgClass: "bg-orange-500/20 text-orange-400",
      },
      {
        id: TaskStatus.FAILED,
        label: "Failed",
        color: "bg-red-500",
        icon: "dangerous",
        iconBgClass: "bg-red-500/20 text-red-400",
      },
    ];
  }

  getColumns(): SubtaskKanbanColumn[] {
    return this.getKanbanColumns();
  }

  getSubtasksByStatus(subtasks: Subtask[], status: TaskStatus): Subtask[] {
    return this.getItemsByStatus(subtasks, status);
  }

  onKanbanSubtaskDrop(
    event: CdkDragDrop<Subtask[]>,
    targetStatus: TaskStatus,
    _todo: Todo | null,
    updateSubtaskFn: (subtaskId: string, newStatus: TaskStatus) => void
  ): void {
    this.onKanbanItemDrop(event as any, targetStatus, _todo, updateSubtaskFn);
  }

  override onKanbanSelectionChange(
    subtaskId: string,
    isSelected: boolean,
    toggleSubtaskSelectionFn: (event: { id: string; selected: boolean }) => void
  ): void {
    super.onKanbanSelectionChange(subtaskId, isSelected, toggleSubtaskSelectionFn);
  }

  isKanbanSubtaskSelected(subtaskId: string, selectedSubtasks: Set<string>): boolean {
    return super.isKanbanItemSelected(subtaskId, selectedSubtasks);
  }

  updateSubtaskStatus(
    subtaskId: string,
    newStatus: TaskStatus,
    todo: Todo | null,
    updateSubtasksFn: (updateFn: (subtasks: Subtask[]) => Subtask[]) => void
  ): void {
    this.updateStatus(subtaskId, newStatus, todo, updateSubtasksFn);
  }

  updateStatus(
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
