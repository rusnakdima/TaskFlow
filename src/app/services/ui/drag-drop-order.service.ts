import { Injectable, inject } from "@angular/core";
import { REQUEST_SERVICE } from "@services/api.service";
import { NotifyService } from "@services/notifications/notify.service";
import { CdkDragDrop } from "@angular/cdk/drag-drop";
import { Observable, of } from "rxjs";
import { catchError, tap } from "rxjs/operators";
import { OrderCalculationService, Orderable } from "./order-calculation.service";

@Injectable({
  providedIn: "root",
})
export class DragDropOrderService {
  private requestService = inject(REQUEST_SERVICE);
  private notifyService = inject(NotifyService);
  private orderCalculationService = inject(OrderCalculationService);

  private updatingOrders = new Set<string>();

  /**
   * Handle drag-drop reordering for any orderable entity list
   */
  handleDrop<T extends Orderable>(
    event: CdkDragDrop<T[]>,
    currentList: T[],
    entityType: string,
    table: string,
    parentTodoId?: string,
    isPrivate: boolean = true
  ): Observable<any> {
    const operationKey = `${entityType}-${parentTodoId || "root"}`;

    if (this.updatingOrders.has(operationKey)) {
      this.notifyService.showWarning("Please wait for previous operation to complete");
      return of(null);
    }

    if (event.previousIndex === event.currentIndex) {
      return of(null);
    }

    const isOffline = this.requestService.isOffline();
    if (isOffline && !isPrivate) {
      this.notifyService.showWarning(
        "Reordering is not available offline for shared tasks. Please connect to the internet and try again."
      );
      return of(null);
    }

    // IMPORTANT: Use currentList directly - it's already sorted for display
    // The CDK indices correspond to this sorted list
    const draggedItem = currentList[event.previousIndex];

    if (!draggedItem) {
      return of(null);
    }

    // Use the global reorder function with currentList (already sorted for display)
    const result = this.orderCalculationService.reorderItems(
      currentList,
      draggedItem.id,
      event.previousIndex,
      event.currentIndex
    );

    if (!result.itemsToUpdate || result.itemsToUpdate.length === 0) {
      return of(null);
    }

    // Handle special fields for todos
    const transformedItems = result.itemsToUpdate.map((item) => {
      if (entityType === "todos") {
        const todo = item as any;
        return {
          ...todo,
          categories: Array.isArray(todo.categories)
            ? todo.categories.map((cat: any) => (typeof cat === "string" ? cat : cat.id))
            : [],
          assignees: Array.isArray(todo.assignees)
            ? todo.assignees.map((a: any) => (typeof a === "string" ? a : a.user_id))
            : [],
        };
      }
      return item;
    });

    this.updatingOrders.add(operationKey);

    const visibility = isPrivate ? "private" : "shared";
    const offlineOption = isOffline ? { offline: true } : {};

    return this.requestService
      .updateAll(table, transformedItems, { visibility, ...offlineOption })
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
