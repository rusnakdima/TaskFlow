import { Injectable, inject } from "@angular/core";
import { StorageService, StorageEntity } from "@services/core/storage.service";
import { DataLoaderService } from "@services/data/data-loader.service";
import { NotifyService } from "@services/notifications/notify.service";
import { ApiProvider } from "@providers/api.provider";
import { CdkDragDrop } from "@angular/cdk/drag-drop";
import { Observable, of } from "rxjs";
import { catchError, tap } from "rxjs/operators";
import { OrderCalculationService, Orderable } from "./order-calculation.service";

@Injectable({
  providedIn: "root",
})
export class DropHandlerService {
  private orderCalculationService = inject(OrderCalculationService);
  private dataSyncService = inject(DataLoaderService);
  private notifyService = inject(NotifyService);
  private dataSyncProvider = inject(ApiProvider);

  private updatingOrders = new Set<string>();

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

    const draggedItem = currentList[event.previousIndex];

    if (!draggedItem) {
      return of(null);
    }

    const result = this.orderCalculationService.reorderItems(
      currentList,
      draggedItem.id,
      event.previousIndex,
      event.currentIndex
    );

    if (result.itemsToUpdate.length === 0) {
      return of(null);
    }

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
          throw err;
        })
      );
  }

  private capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}
