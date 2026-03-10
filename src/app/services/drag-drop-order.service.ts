import { Injectable, inject } from "@angular/core";
import { StorageService, StorageEntity } from "@services/storage.service";
import { DataSyncService } from "@services/data-sync.service";
import { NotifyService } from "@services/notify.service";
import { DataSyncProvider } from "@providers/data-sync.provider";
import { moveItemInArray, CdkDragDrop } from "@angular/cdk/drag-drop";
import { Observable, of } from "rxjs";
import { catchError, tap } from "rxjs/operators";

export interface Orderable {
  id: string;
  order: number;
  [key: string]: any;
}

@Injectable({
  providedIn: "root",
})
export class DragDropOrderService {
  private storageService = inject(StorageService);
  private dataSyncService = inject(DataSyncService);
  private notifyService = inject(NotifyService);
  private dataSyncProvider = inject(DataSyncProvider);

  private updatingOrders = new Set<string>();

  /**
   * Handle drag-drop reordering for any orderable entity list
   * @param event The CDK drag-drop event
   * @param currentList The current filtered list being displayed
   * @param entityType The storage entity type ('todo', 'task', 'subtask')
   * @param table The backend table name ('todos', 'tasks', 'subtasks')
   * @param parentTodoId Optional parent todo ID for tasks/subtasks
   * @param syncOptions Optional sync options (isOwner, isPrivate)
   */
  handleDrop<T extends Orderable>(
    event: CdkDragDrop<T[]>,
    currentList: T[],
    entityType: StorageEntity,
    table: string,
    parentTodoId?: string,
    syncOptions?: { isOwner?: boolean; isPrivate?: boolean }
  ): Observable<any> {
    const operationKey = `${entityType}-${parentTodoId || "root"}`;

    if (this.updatingOrders.has(operationKey)) {
      this.notifyService.showWarning("Please wait for previous operation to complete");
      return of(null);
    }

    if (event.previousIndex === event.currentIndex) {
      return of(null);
    }

    const items = [...currentList];
    const previousItems = items.map((item) => ({ ...item }));

    // Move item in array
    moveItemInArray(items, event.previousIndex, event.currentIndex);

    // Recalculate order for ALL items in the current view
    // Descending order: highest index = lowest order value
    const transformedItems = items.map((item, index) => {
      const updatedItem = {
        ...item,
        order: items.length - 1 - index,
      };

      // Handle special fields for Todo
      if (entityType === "todo") {
        const todo = item as any;
        (updatedItem as any).categories =
          todo.categories?.map((cat: any) => (typeof cat === "string" ? cat : cat.id)) || [];
        (updatedItem as any).assignees =
          todo.assignees?.map((a: any) => (typeof a === "string" ? a : a.userId)) || [];
      }

      return updatedItem;
    });

    // Optimistic update to storage
    transformedItems.forEach((item) => {
      this.storageService.updateItem(entityType, item.id, { order: item.order });
    });

    this.notifyService.showSuccess(`${this.capitalize(entityType)} order updated`);
    this.updatingOrders.add(operationKey);

    return this.dataSyncProvider
      .updateAll<T>(table, transformedItems, syncOptions, parentTodoId)
      .pipe(
        tap(() => {
          this.updatingOrders.delete(operationKey);
        }),
        catchError((err) => {
          // Rollback
          previousItems.forEach((item) => {
            this.storageService.updateItem(entityType, item.id, { order: item.order });
          });
          this.updatingOrders.delete(operationKey);
          this.notifyService.showError(err.message || `Failed to update ${entityType} order`);
          // Reload all data to ensure consistency on fatal error
          this.dataSyncService.loadAllData(true).subscribe();
          throw err;
        })
      );
  }

  private capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}
