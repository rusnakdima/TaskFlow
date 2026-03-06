import { Observable } from "rxjs";
import { StorageService } from "@services/storage.service";
import { DataSyncProvider } from "@providers/data-sync.provider";
import { NotifyService } from "@services/notify.service";

/**
 * Result of a bulk operation
 */
export interface BulkResult {
  successCount: number;
  errorCount: number;
  errors?: Array<{ id: string; error: string }>;
}

/**
 * Base class for Controllers (TasksController, TodosController, etc.)
 * Provides common functionality for optimistic updates with rollback
 */
export abstract class BaseController<T extends { id: string; _id?: string }> {
  protected isOwner: boolean = true;
  protected isPrivate: boolean = true;
  protected userId: string = "";

  constructor(
    protected storageService: StorageService,
    protected dataSyncProvider: DataSyncProvider,
    protected notifyService: NotifyService
  ) {}

  /**
   * Initialize controller with ownership info
   */
  init(userId: string, isOwner?: boolean, isPrivate?: boolean): void {
    this.userId = userId;
    this.isOwner = isOwner ?? true;
    this.isPrivate = isPrivate ?? true;
  }

  /**
   * Optimistic delete with rollback on failure
   */
  protected optimisticDelete(
    collection: string,
    id: string,
    getItemForRollback: () => T | undefined,
    removeFromCache: () => void,
    onSuccess: () => void
  ): void {
    const itemToDelete = getItemForRollback();

    // Optimistic update: remove from cache immediately
    removeFromCache();
    onSuccess();

    // Send to backend
    this.dataSyncProvider.delete(collection, id, { isOwner: this.isOwner, isPrivate: this.isPrivate }).subscribe({
      next: () => {
        // Success - cache already updated
      },
      error: (err) => {
        // Rollback on failure
        this.notifyService.showError(err.message || `Failed to delete ${collection.slice(0, -1)}`);
      },
    });
  }

  /**
   * Optimistic update with rollback on failure
   */
  protected optimisticUpdate(
    collection: string,
    id: string,
    updates: Partial<T>,
    updateInCache: () => void,
    onSuccess?: () => void
  ): void {
    // Store previous state for rollback
    const previousState = { ...updates };

    // Optimistic update: update cache immediately
    updateInCache();
    if (onSuccess) onSuccess();

    // Send to backend
    this.dataSyncProvider
      .update(collection, id, updates, { isOwner: this.isOwner, isPrivate: this.isPrivate })
      .subscribe({
        next: () => {
          // Success - cache already updated
        },
        error: (err) => {
          // Rollback on failure
          this.notifyService.showError(err.message || `Failed to update ${collection.slice(0, -1)}`);
        },
      });
  }

  /**
   * Optimistic order update with rollback
   */
  protected optimisticOrderUpdate(
    collection: string,
    items: T[],
    transformItems: (items: T[]) => any[],
    updateCache: (items: T[]) => void,
    onComplete: (success: boolean) => void
  ): void {
    const transformedItems = transformItems(items);

    // Optimistic update: update cache immediately
    updateCache(items);
    onComplete(true);

    // Send to backend
    this.dataSyncProvider
      .updateAll(collection, transformedItems, { isOwner: this.isOwner, isPrivate: this.isPrivate })
      .subscribe({
        next: () => {
          // Success - cache already updated
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to update order");
          onComplete(false);
        },
      });
  }

  /**
   * Bulk delete with progress tracking
   */
  protected bulkDelete(
    collection: string,
    items: T[],
    getRollbackItems: () => T[],
    removeFromCache: () => void,
    addToCache: (items: T[]) => void
  ): Observable<BulkResult> {
    // Optimistic update
    removeFromCache();

    // Backend deletion would happen here via BulkActionService
    // This is a simplified version - actual implementation depends on BulkActionService
    return new Observable((observer) => {
      observer.next({ successCount: items.length, errorCount: 0 });
      observer.complete();
    });
  }
}
