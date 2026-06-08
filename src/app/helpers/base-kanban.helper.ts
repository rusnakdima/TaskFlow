import { signal, inject } from "@angular/core";
import { CdkDragDrop } from "@angular/cdk/drag-drop";
import { TaskStatus, Todo } from "@models/generated/api.types";
import { BaseItemHelper } from "@helpers/base-item.helper";
import { NotifyService } from "@services/notifications/notify.service";
import { KanbanDragDropService } from "@services/ui/kanban-drag-drop.service";
import { ApiService, Visibility } from "@services/api.service";

export interface KanbanColumn {
  id: TaskStatus;
  label: string;
  color: string;
  icon: string;
  iconBgClass: string;
}

export const KANBAN_COLUMNS: KanbanColumn[] = [
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

export abstract class BaseKanbanHelper<T extends { id: string; status: TaskStatus }> {
  protected notifyService = inject(NotifyService);
  protected kanbanDragDropService = inject(KanbanDragDropService);
  protected requestService = inject(ApiService);

  protected _isUpdatingKanban = signal(false);

  getColumnColorClass = BaseItemHelper.getColumnColorClass;

  abstract getEntityName(): string;
  abstract getColumns(): KanbanColumn[];
  abstract getEntityNameForUpdate(): string;
  abstract updateStatus(
    entityId: string,
    newStatus: TaskStatus,
    todo: Todo | null,
    updateFn: (updateFn: (items: T[]) => T[]) => void
  ): void;

  protected updateStatusInternal(
    entityId: string,
    newStatus: TaskStatus,
    todo: Todo | null,
    updateFn: (updateFn: (items: T[]) => T[]) => void,
    entityName: string
  ): void {
    if (!entityId) {
      this.notifyService.showError(`Invalid ${entityName} ID`);
      return;
    }

    if (this._isUpdatingKanban()) {
      this.notifyService.showWarning("Please wait for previous operation to complete");
      return;
    }

    this._isUpdatingKanban.set(true);

    const visibility = todo?.visibility || "private";

    this.requestService
      .update<T>(entityName, entityId, { status: newStatus } as Partial<T>, {
        visibility: visibility as Visibility,
      })
      .subscribe({
        next: () => {
          updateFn((items) =>
            items.map((item) =>
              item.id === entityId ? ({ ...item, status: newStatus } as T) : item
            )
          );
          this._isUpdatingKanban.set(false);
          this.notifyService.showSuccess(
            `${entityName.charAt(0).toUpperCase() + entityName.slice(1)} moved to ${newStatus}`
          );
        },
        error: (err) => {
          this._isUpdatingKanban.set(false);
          this.notifyService.showError(err.message || `Failed to update ${entityName}`);
        },
      });
  }

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
    this.kanbanDragDropService.handleKanbanDrop<T>(
      event,
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
