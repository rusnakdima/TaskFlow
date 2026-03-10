/* sys lib */
import { Injectable, inject } from "@angular/core";

/* services */
import { StorageService, StorageEntity } from "@services/storage.service";
import { NotifyService } from "@services/notify.service";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

@Injectable({
  providedIn: "root",
})
export class StateHelper {
  private storageService = inject(StorageService);
  private dataSyncProvider = inject(DataSyncProvider);
  private notifyService = inject(NotifyService);

  /**
   * Perform an optimistic update for an entity
   * @param entityType The type of entity ('task', 'subtask', 'todo', 'category')
   * @param id The ID of the entity
   * @param updates The partial updates to apply
   * @param originalData The original data for rollback
   * @param parentTodoId Optional parent todo ID for task/subtask updates
   */
  updateOptimistically<T extends object>(
    entityType: StorageEntity,
    id: string,
    updates: Partial<T>,
    originalData: T,
    parentTodoId?: string
  ): void {
    // 1. Apply optimistic update to storage
    this.storageService.updateItem(entityType, id, updates);

    // 2. Sync with backend
    const table = this.mapToTable(entityType);
    this.dataSyncProvider.update<T>(table, id, updates, undefined, parentTodoId).subscribe({
      next: (result: T) => {
        // Confirm update with real data from backend
        this.storageService.updateItem(entityType, id, result);
      },
      error: (err: any) => {
        // 3. Rollback on error
        this.storageService.updateItem(entityType, id, originalData);
        this.notifyService.showError(err.message || `Failed to update ${entityType}`);
      },
    });
  }

  /**
   * Perform an optimistic delete for an entity
   * @param entityType The type of entity ('task', 'subtask', 'todo', 'category')
   * @param id The ID of the entity
   * @param originalData The original data for rollback
   * @param parentTodoId Optional parent todo ID
   */
  deleteOptimistically<T extends object>(
    entityType: StorageEntity,
    id: string,
    originalData: T,
    parentTodoId?: string
  ): void {
    // 1. Apply optimistic delete to storage
    this.storageService.removeItem(entityType, id);

    // 2. Sync with backend
    const table = this.mapToTable(entityType);
    this.dataSyncProvider.delete(table, id, undefined, parentTodoId).subscribe({
      error: (err: any) => {
        // 3. Rollback (re-add) on error
        this.storageService.addItem(entityType, originalData);
        this.notifyService.showError(err.message || `Failed to delete ${entityType}`);
      },
    });
  }

  /**
   * Maps storage entity type to backend table name
   */
  private mapToTable(entityType: StorageEntity): string {
    switch (entityType) {
      case "todo":
        return "todos";
      case "task":
        return "tasks";
      case "subtask":
        return "subtasks";
      case "category":
        return "categories";
      default:
        return entityType + "s";
    }
  }
}
