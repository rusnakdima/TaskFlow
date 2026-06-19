import { Injectable } from "@angular/core";
import { CdkDragDrop } from "@angular/cdk/drag-drop";
import { Subtask, TaskStatus, Todo } from "@entities/generated/api.types";
import { BaseKanbanHelper, KanbanColumn, KANBAN_COLUMNS } from "@helpers/base-kanban.helper";

export interface SubtaskKanbanColumn extends KanbanColumn {}

@Injectable({ providedIn: "root" })
export class SubtasksKanbanHelper extends BaseKanbanHelper<Subtask> {
  getEntityName(): string {
    return "subtask";
  }

  getEntityNameForUpdate(): string {
    return "subtask";
  }

  getKanbanColumns(): SubtaskKanbanColumn[] {
    return KANBAN_COLUMNS;
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
    this.updateStatusInternal(subtaskId, newStatus, todo, updateSubtasksFn, "subtasks");
  }
}
