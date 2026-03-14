/* sys lib */
import { Injectable, inject } from "@angular/core";
import { BehaviorSubject, Observable, Subject, timer } from "rxjs";
import { switchMap, takeWhile } from "rxjs/operators";

/* services */
import { StorageService } from "@services/core/storage.service";
import { NotifyService } from "@services/notifications/notify.service";

/* models */
import { SyncMetadata } from "@models/sync-metadata";

export interface QueuedOperation {
  id: string;
  operation: "create" | "update" | "delete";
  entityType: string;
  entityId: string;
  data?: any;
  parentTodoId?: string;
  syncMetadata?: SyncMetadata;
  timestamp: number;
  retryCount: number;
  tempId?: string; // For creates, maps temp ID to real ID
  status: "pending" | "processing" | "failed" | "completed";
  errorMessage?: string;
}

// Type for the execute function passed from DataSyncProvider
export type ExecuteOperationFn = (
  operation: "create" | "update" | "delete",
  entityType: string,
  entityId: string,
  data?: any,
  parentTodoId?: string
) => Promise<any>;

@Injectable({
  providedIn: "root",
})
export class OfflineQueueService {
  private storageService = inject(StorageService);
  private notifyService = inject(NotifyService);

  private queue = new Map<string, QueuedOperation>();
  private isOnlineSubject = new BehaviorSubject<boolean>(this.checkOnlineStatus());
  private isProcessingSubject = new BehaviorSubject<boolean>(false);
  private queueSizeSubject = new BehaviorSubject<number>(0);
  private processTriggerSubject = new Subject<void>();

  // Execute function set by DataSyncProvider
  private executeFn: ExecuteOperationFn | null = null;

  private maxRetries = 3;
  private retryDelayMs = 2000;

  constructor() {
    // Listen to online/offline events
    window.addEventListener("online", () => this.setOnline(true));
    window.addEventListener("offline", () => this.setOnline(false));

    // Start queue processor
    this.initQueueProcessor();

    // Initial status check
    this.updateQueueSize();
  }

  private checkOnlineStatus(): boolean {
    return navigator.onLine;
  }

  setOnline(online: boolean) {
    const wasOffline = !this.isOnlineSubject.value;
    this.isOnlineSubject.next(online);

    if (online && wasOffline) {
      this.notifyService.showSuccess("Connection restored. Syncing pending operations...");
      this.processTriggerSubject.next();
    } else if (!online) {
      this.notifyService.showWarning("You are offline. Changes will sync when reconnected.");
    }
  }

  /**
   * Set the execute function from DataSyncProvider (called during initialization)
   */
  setExecuteFunction(fn: ExecuteOperationFn): void {
    this.executeFn = fn;
  }

  /**
   * Get online status as observable
   */
  isOnline$(): Observable<boolean> {
    return this.isOnlineSubject.asObservable();
  }

  /**
   * Check if currently online
   */
  isOnline(): boolean {
    return this.isOnlineSubject.value;
  }

  /**
   * Get processing status as observable
   */
  isProcessing$(): Observable<boolean> {
    return this.isProcessingSubject.asObservable();
  }

  /**
   * Get queue size as observable
   */
  queueSize$(): Observable<number> {
    return this.queueSizeSubject.asObservable();
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.queue.size;
  }

  /**
   * Get all queued operations
   */
  getQueuedOperations(): QueuedOperation[] {
    return Array.from(this.queue.values());
  }

  /**
   * Get pending operations count
   */
  getPendingCount(): number {
    return Array.from(this.queue.values()).filter((op) => op.status === "pending").length;
  }

  /**
   * Add operation to queue
   */
  enqueue(operation: Omit<QueuedOperation, "id" | "timestamp" | "retryCount" | "status">): string {
    const queueOp: QueuedOperation = {
      ...operation,
      id: Math.random().toString(36).substring(7),
      timestamp: Date.now(),
      retryCount: 0,
      status: "pending",
    };

    this.queue.set(queueOp.id, queueOp);
    this.updateQueueSize();

    // If online, try to process immediately
    if (this.isOnlineSubject.value) {
      this.processTriggerSubject.next();
    }

    return queueOp.id;
  }

  /**
   * Remove operation from queue
   */
  remove(operationId: string): void {
    this.queue.delete(operationId);
    this.updateQueueSize();
  }

  /**
   * Clear all operations
   */
  clear(): void {
    this.queue.clear();
    this.updateQueueSize();
  }

  /**
   * Initialize queue processor
   */
  private initQueueProcessor() {
    // Process queue when triggered and online
    this.processTriggerSubject
      .pipe(
        switchMap(() => timer(0, this.retryDelayMs)),
        takeWhile(() => true) // Keep listening
      )
      .subscribe(() => {
        if (this.isOnlineSubject.value && !this.isProcessingSubject.value) {
          this.processQueue();
        }
      });
  }

  /**
   * Process queue when online
   */
  private async processQueue() {
    if (this.isProcessingSubject.value) return;

    this.isProcessingSubject.next(true);

    const pendingOperations = Array.from(this.queue.values()).filter(
      (op) => op.status === "pending" || op.status === "failed"
    );

    let successCount = 0;
    let failCount = 0;

    for (const op of pendingOperations) {
      try {
        op.status = "processing";
        await this.executeOperation(op);
        op.status = "completed";
        this.queue.delete(op.id);
        successCount++;
      } catch (error) {
        // Increment retry count
        op.retryCount++;
        op.status = "failed";
        op.errorMessage = error instanceof Error ? error.message : String(error);

        if (op.retryCount >= this.maxRetries) {
          // Max retries reached, notify user and keep in queue
          this.notifyService.showError(
            `Failed to sync ${op.operation} "${op.entityId}" after ${this.maxRetries} attempts. Please check your connection.`
          );
          failCount++;
        } else {
          // Will retry on next cycle
        }
      }
    }

    this.updateQueueSize();
    this.isProcessingSubject.next(false);

    // Notify user of results
    if (successCount > 0) {
      this.notifyService.showSuccess(`Synced ${successCount} operation(s)`);
    }

    if (failCount > 0 && this.queue.size > 0) {
      this.notifyService.showWarning(`${this.queue.size} operations still pending sync`);
    } else if (this.queue.size === 0) {
      this.notifyService.showSuccess("All changes synced successfully");
    }
  }

  /**
   * Execute a single operation using the injected execute function
   */
  private async executeOperation(op: QueuedOperation): Promise<void> {
    if (!this.executeFn) {
      throw new Error("Execute function not set. Call setExecuteFunction() first.");
    }

    return this.executeFn(op.operation, op.entityType, op.entityId, op.data, op.parentTodoId);
  }

  private updateQueueSize(): void {
    this.queueSizeSubject.next(this.queue.size);
  }

  /**
   * Manually trigger sync (e.g., when user clicks sync button)
   */
  triggerSync(): void {
    if (this.isOnlineSubject.value) {
      this.processTriggerSubject.next();
    } else {
      this.notifyService.showWarning("Cannot sync: offline");
    }
  }
}
