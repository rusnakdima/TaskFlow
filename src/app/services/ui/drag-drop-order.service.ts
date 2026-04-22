import { Injectable, inject } from "@angular/core";
import { StorageService, StorageEntity } from "@services/core/storage.service";
import { DataLoaderService } from "@services/data/data-loader.service";
import { NotifyService } from "@services/notifications/notify.service";
import { ApiProvider } from "@providers/api.provider";
import { moveItemInArray, CdkDragDrop } from "@angular/cdk/drag-drop";
import { Observable, of } from "rxjs";
import { catchError, tap } from "rxjs/operators";

export interface Orderable {
  id: string;
  order: number;
  [key: string]: any;
}

export interface ReorderResult<T extends Orderable> {
  itemsToUpdate: T[];
  movedItemId: string;
  oldIndex: number;
  newIndex: number;
}

@Injectable({
  providedIn: "root",
})
export class DragDropOrderService {
  private storageService = inject(StorageService);
  private dataSyncService = inject(DataLoaderService);
  private notifyService = inject(NotifyService);
  private dataSyncProvider = inject(ApiProvider);

  private updatingOrders = new Set<string>();

  /**
   * Global reorder function that handles reordering for todos, tasks, and subtasks
   * Works with descending order display (higher order value = shown first)
   */
  reorderItems<T extends Orderable>(
    allItems: T[],
    itemId: string,
    oldIndex: number,
    newIndex: number
  ): ReorderResult<T> {
    const safeOldIndex = Math.max(0, Math.min(oldIndex, allItems.length - 1));
    const safeNewIndex = Math.max(0, Math.min(newIndex, allItems.length - 1));

    if (safeOldIndex === safeNewIndex) {
      return {
        itemsToUpdate: [],
        movedItemId: itemId,
        oldIndex: safeOldIndex,
        newIndex: safeNewIndex,
      };
    }

    // Create a copy and move item
    const items = [...allItems];
    moveItemInArray(items, safeOldIndex, safeNewIndex);

    // Recalculate order values for ALL items based on new positions
    // Position 0 (first displayed) gets highest order value
    const itemsToUpdate = items.map((item, index) => ({
      ...item,
      order: items.length - 1 - index,
    }));

    return {
      itemsToUpdate: itemsToUpdate as T[],
      movedItemId: itemId,
      oldIndex: safeOldIndex,
      newIndex: safeNewIndex,
    };
  }

  /**
   * Handle drag-drop reordering for any orderable entity list
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

    // IMPORTANT: Use currentList directly - it's already sorted for display
    // The CDK indices correspond to this sorted list
    const draggedItem = currentList[event.previousIndex];

    if (!draggedItem) {
      return of(null);
    }

    // Use the global reorder function with currentList (already sorted for display)
    const result = this.reorderItems(
      currentList,
      draggedItem.id,
      event.previousIndex,
      event.currentIndex
    );

    if (result.itemsToUpdate.length === 0) {
      return of(null);
    }

    // Handle special fields for todos
    const transformedItems = result.itemsToUpdate.map((item) => {
      if (entityType === "todos") {
        const todo = item as any;
        return {
          ...todo,
          categories:
            todo.categories?.map((cat: any) => (typeof cat === "string" ? cat : cat.id)) || [],
          assignees: todo.assignees?.map((a: any) => (typeof a === "string" ? a : a.user_id)) || [],
        };
      }
      return item;
    });

    this.updatingOrders.add(operationKey);

    return this.dataSyncProvider
      .crud<
        T[]
      >("updateAll", table, { data: transformedItems, parentTodoId: parentTodoId, ...syncOptions }, true)
      .pipe(
        tap(() => {
          this.updatingOrders.delete(operationKey);
          this.notifyService.showSuccess(`${this.capitalize(entityType)} order updated`);
        }),
        catchError((err) => {
          this.updatingOrders.delete(operationKey);
          this.notifyService.showError(err.message || `Failed to update ${entityType} order`);
          this.dataSyncService.loadAllData(true).subscribe();
          throw err;
        })
      );
  }

  private capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}
