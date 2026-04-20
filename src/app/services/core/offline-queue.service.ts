/* sys lib */
import { Injectable, inject } from "@angular/core";
import { BehaviorSubject, Observable, fromEvent, merge, of } from "rxjs";
import { map, distinctUntilChanged, catchError, tap, take } from "rxjs/operators";

/* services */
import { ApiProvider } from "@providers/api.provider";

interface QueuedOperation {
  id: string;
  operation: "create" | "update" | "delete";
  table: string;
  data: any;
  timestamp: number;
  retryCount: number;
}

@Injectable({
  providedIn: "root",
})
export class OfflineQueueService {
  private apiProvider = inject(ApiProvider);

  private readonly QUEUE_KEY = "offline_queue";
  private readonly MAX_RETRIES = 3;

  private queueSubject = new BehaviorSubject<QueuedOperation[]>([]);
  private isProcessingSubject = new BehaviorSubject<boolean>(false);
  private isOnlineSubject = new BehaviorSubject<boolean>(navigator.onLine);

  constructor() {
    this.loadQueueFromStorage();
    this.setupNetworkListeners();
  }

  private loadQueueFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.QUEUE_KEY);
      if (stored) {
        const queue = JSON.parse(stored) as QueuedOperation[];
        this.queueSubject.next(queue);
      }
    } catch (error) {
      // Silently handle storage errors - queue will start empty
    }
  }

  private saveQueueToStorage(): void {
    try {
      const queue = this.queueSubject.getValue();
      localStorage.setItem(this.QUEUE_KEY, JSON.stringify(queue));
    } catch (error) {
      // Silently handle storage errors
    }
  }

  private setupNetworkListeners(): void {
    const online$ = fromEvent(window, "online").pipe(map(() => true));
    const offline$ = fromEvent(window, "offline").pipe(map(() => false));

    merge(online$, offline$)
      .pipe(
        distinctUntilChanged(),
        tap((isOnline) => {
          this.isOnlineSubject.next(isOnline);
          if (isOnline) {
            this.triggerSync();
          }
        }),
        catchError(() => of(navigator.onLine))
      )
      .subscribe();
  }

  isOnline$(): Observable<boolean> {
    return this.isOnlineSubject.asObservable().pipe(distinctUntilChanged());
  }

  isOnline(): boolean {
    return this.isOnlineSubject.getValue();
  }

  isProcessing$(): Observable<boolean> {
    return this.isProcessingSubject.asObservable();
  }

  isProcessing(): boolean {
    return this.isProcessingSubject.getValue();
  }

  queueSize$(): Observable<number> {
    return this.queueSubject.asObservable().pipe(map((queue) => queue.length));
  }

  getQueueSize(): number {
    return this.queueSubject.getValue().length;
  }

  getQueuedOperations(): QueuedOperation[] {
    return this.queueSubject.getValue();
  }

  getPendingCount(): number {
    return this.queueSubject.getValue().filter((op) => op.retryCount < this.MAX_RETRIES).length;
  }

  enqueue(operation: Omit<QueuedOperation, "id" | "timestamp" | "retryCount">): string {
    const queuedOp: QueuedOperation = {
      ...operation,
      id: this.generateId(),
      timestamp: Date.now(),
      retryCount: 0,
    };

    const currentQueue = this.queueSubject.getValue();
    this.queueSubject.next([...currentQueue, queuedOp]);
    this.saveQueueToStorage();

    return queuedOp.id;
  }

  remove(operationId: string): void {
    const currentQueue = this.queueSubject.getValue();
    this.queueSubject.next(currentQueue.filter((op) => op.id !== operationId));
    this.saveQueueToStorage();
  }

  clear(): void {
    this.queueSubject.next([]);
    this.saveQueueToStorage();
  }

  triggerSync(): void {
    if (this.isProcessingSubject.getValue() || !navigator.onLine) {
      return;
    }

    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    const queue = this.queueSubject.getValue();
    if (queue.length === 0) {
      return;
    }

    this.isProcessingSubject.next(true);

    const operationsToProcess = [...queue];
    const failedOperations: QueuedOperation[] = [];

    for (const operation of operationsToProcess) {
      if (!navigator.onLine) {
        failedOperations.push(operation);
        continue;
      }

      try {
        await this.processOperation(operation);
        this.remove(operation.id);
      } catch (error) {
        operation.retryCount++;
        if (operation.retryCount >= this.MAX_RETRIES) {
          this.remove(operation.id);
        } else {
          failedOperations.push(operation);
        }
      }
    }

    if (failedOperations.length > 0) {
      this.queueSubject.next(failedOperations);
      this.saveQueueToStorage();
    }

    this.isProcessingSubject.next(false);
  }

  private processOperation(operation: QueuedOperation): Promise<any> {
    return new Promise((resolve, reject) => {
      let crud$: Observable<any>;

      switch (operation.operation) {
        case "create":
          crud$ = this.apiProvider.crud(
            "create" as any,
            operation.table,
            { data: operation.data },
            false
          );
          break;
        case "update":
          crud$ = this.apiProvider.crud(
            "update" as any,
            operation.table,
            { data: operation.data, id: operation.id },
            false
          );
          break;
        case "delete":
          crud$ = this.apiProvider.crud(
            "delete" as any,
            operation.table,
            { id: operation.id },
            false
          );
          break;
        default:
          reject(new Error(`Unknown operation: ${operation.operation}`));
          return;
      }

      crud$.pipe(take(1)).subscribe({
        next: (result) => resolve(result),
        error: (err) => reject(err),
      });
    });
  }

  private generateId(): string {
    return `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
