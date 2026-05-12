import { signal, inject } from "@angular/core";
import { CdkDragDrop } from "@angular/cdk/drag-drop";
import { TaskStatus, Todo } from "@models/generated/api.types";
import { BaseItemHelper } from "@helpers/base-item.helper";
import { NotifyService } from "@services/notifications/notify.service";
import { KanbanDragDropService } from "@services/ui/kanban-drag-drop.service";

export interface KanbanColumn {
  id: TaskStatus;
  label: string;
  color: string;
  icon: string;
  iconBgClass: string;
}

export abstract class BaseKanbanHelper<T extends { id: string; status: TaskStatus }> {
  protected notifyService = inject(NotifyService);
  protected kanbanDragDropService = inject(KanbanDragDropService);

  protected _isUpdatingKanban = signal(false);

  getColumnColorClass = BaseItemHelper.getColumnColorClass;

  abstract getEntityName(): string;
  abstract getColumns(): KanbanColumn[];
  abstract updateStatus(
    entityId: string,
    newStatus: TaskStatus,
    todo: Todo | null,
    updateFn: (updateFn: (items: T[]) => T[]) => void
  ): void;

  getItemsByStatus(items: T[], status: TaskStatus): T[] {
    return items.filter((item) => item.status === status);
  }

  getConnectedKanbanDropLists(currentStatus: TaskStatus): string[] {
    return this.kanbanDragDropService.getConnectedDropLists(
      currentStatus,
      this.getColumns() as any
    );
  }

  onKanbanItemDrop(
    event: CdkDragDrop<T[]>,
    targetStatus: TaskStatus,
    _todo: Todo | null,
    updateItemFn: (itemId: string, newStatus: TaskStatus) => void
  ): void {
    this.kanbanDragDropService.handleTaskDrop(
      event as any,
      targetStatus,
      this._isUpdatingKanban(),
      (newStatus, itemId) => {
        if (itemId) {
          updateItemFn(itemId, newStatus);
        }
      }
    );
  }

  onKanbanStatusCycle(
    item: T,
    updateItemFn: (itemId: string, newStatus: TaskStatus) => void
  ): void {
    const newStatus = BaseItemHelper.getNextStatus(item.status);
    updateItemFn(item.id, newStatus);
  }

  onKanbanSelectionChange(
    itemId: string,
    isSelected: boolean,
    toggleSelectionFn: (event: { id: string; selected: boolean }) => void
  ): void {
    toggleSelectionFn({ id: itemId, selected: isSelected });
  }

  isKanbanItemSelected(itemId: string, selectedItems: Set<string>): boolean {
    return selectedItems.has(itemId);
  }
}
