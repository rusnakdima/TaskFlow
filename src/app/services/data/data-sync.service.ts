/* sys lib */
import { Injectable, OnDestroy } from "@angular/core";
import { Observable, of, Subject, merge, interval, from } from "rxjs";
import { switchMap, filter, take } from "rxjs/operators";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

/* models */
import { Response, ResponseStatus } from "@models/response.model";
import { DataService } from "./data.service";

export interface QueuedOperation {
  id: string;
  operation: "create" | "update" | "delete";
  table: string;
  data?: any;
  timestamp: number;
  retries: number;
}

@Injectable({
  providedIn: "root",
})
export class DataSyncService implements OnDestroy {
  private offlineQueue: QueuedOperation[] = [];
  private readonly MAX_RETRIES = 3;
  private readonly DEFAULT_SYNC_INTERVAL = 30000;
  private syncIntervalId?: number;

  private onlineStatusSubject = new Subject<boolean>();
  private dbChangeSubjects: Map<string, Subject<any>> = new Map();
  private tauriUnlisteners: UnlistenFn[] = [];

  private readonly QUEUE_STORAGE_KEY = "taskflow_offline_queue";

  constructor() {
    this.loadQueueFromSession();
    this.initNetworkListeners();
    this.initDbChangeSubjects();
  }

  ngOnDestroy(): void {
    this.stopPeriodicSync();
    this.tauriUnlisteners.forEach((unlisten) => unlisten());
    this.tauriUnlisteners = [];
  }

  private isOnline(): boolean {
    return navigator.onLine;
  }

  private initNetworkListeners(): void {
    window.addEventListener("online", () => {
      this.onlineStatusSubject.next(true);
      this.processOfflineQueue();
      this.startPeriodicSync();
    });

    window.addEventListener("offline", () => {
      this.onlineStatusSubject.next(false);
      this.stopPeriodicSync();
    });
  }

  private initDbChangeSubjects(): void {
    const collections = ["todos", "tasks", "subtasks", "comments", "chats", "categories"];
    collections.forEach((collection) => {
      this.dbChangeSubjects.set(collection, new Subject<any>());
    });
  }

  async initTauriListeners(dataService: DataService): Promise<void> {
    const collections = ["todos", "tasks", "subtasks", "comments", "chats", "categories"];

    const subjectMap: Record<string, any> = {
      todos: dataService.todos$,
      tasks: dataService.tasks$,
      subtasks: dataService.subtasks$,
      comments: dataService.comments$,
      chats: dataService.chats$,
      categories: dataService.categories$,
    };

    for (const collection of collections) {
      const unlisten = await listen(`db-change-${collection}`, (event: any) => {
        const subject = this.dbChangeSubjects.get(collection);
        const dataServiceSubject = subjectMap[collection];
        if (subject) {
          const payload = event.payload;
          const operationType = this.mapOperationType(payload.operationType);
          subject.next({
            operationType,
            data: payload.data,
            collection,
          });
        }

        if (dataServiceSubject) {
          const payload = event.payload;
          const fullDocument = payload.fullDocument || payload.data;
          dataServiceSubject.next(fullDocument);
        }
      });
      this.tauriUnlisteners.push(unlisten);
    }
  }

  private mapOperationType(operationType: string): "insert" | "update" | "replace" | "delete" {
    switch (operationType) {
      case "insert":
        return "insert";
      case "update":
        return "update";
      case "replace":
        return "replace";
      case "delete":
        return "delete";
      default:
        return "update";
    }
  }

  onDbChange(collection: string): Observable<any> {
    const subject = this.dbChangeSubjects.get(collection);
    return subject ? subject.asObservable() : of();
  }

  get onlineStatus$(): Observable<boolean> {
    return this.onlineStatusSubject.asObservable();
  }

  queueOperation(operation: "create" | "update" | "delete", table: string, data?: any): string {
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const queuedOp: QueuedOperation = {
      id: tempId,
      operation,
      table,
      data: operation === "create" ? { ...data, id: tempId } : data,
      timestamp: Date.now(),
      retries: 0,
    };

    this.offlineQueue.push(queuedOp);
    this.saveQueueToSession();

    return tempId;
  }

  private async processOfflineQueue(): Promise<void> {
    if (!this.isOnline() || this.offlineQueue.length === 0) {
      return;
    }

    const queue = [...this.offlineQueue];
    this.offlineQueue = [];

    for (const op of queue) {
      try {
        await this.processOperation(op);
      } catch (error) {
        if (op.retries < this.MAX_RETRIES) {
          op.retries++;
          this.offlineQueue.push(op);
        }
      }
    }

    this.saveQueueToSession();
  }

  private async processOperation(op: QueuedOperation): Promise<void> {
    await invoke("process_queued_operation", {
      operation: op.operation,
      table: op.table,
      data: op.data,
    });
  }

  private saveQueueToSession(): void {
    try {
      sessionStorage.setItem(this.QUEUE_STORAGE_KEY, JSON.stringify(this.offlineQueue));
    } catch (error) {
      console.error("Failed to save offline queue to sessionStorage:", error);
    }
  }

  private loadQueueFromSession(): void {
    try {
      const stored = sessionStorage.getItem(this.QUEUE_STORAGE_KEY);
      if (stored) {
        this.offlineQueue = JSON.parse(stored);
      }
    } catch (error) {
      console.error("Failed to load offline queue from sessionStorage:", error);
      this.offlineQueue = [];
    }
  }

  startPeriodicSync(userId?: string): void {
    if (this.syncIntervalId) {
      return;
    }

    this.syncIntervalId = window.setInterval(async () => {
      if (this.isOnline() && userId) {
        try {
          await invoke("sync_data", { userId });
        } catch (error) {
          console.error("Periodic sync failed:", error);
        }
      }
    }, this.DEFAULT_SYNC_INTERVAL);
  }

  stopPeriodicSync(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = undefined;
    }
  }

  importFromCloud(): Observable<Response<any>> {
    return from(
      (async () => {
        const token = this.getToken();
        const userId = this.getUserId();

        if (!userId) {
          return {
            status: ResponseStatus.ERROR,
            message: "User not authenticated",
            data: null,
          } as Response<any>;
        }

        const result = await invoke<Response<any>>("import_to_local", {
          userId,
          token,
        });
        return result;
      })()
    );
  }

  exportToCloud(): Observable<Response<any>> {
    return from(
      (async () => {
        const token = this.getToken();
        const userId = this.getUserId();

        if (!userId) {
          return {
            status: ResponseStatus.ERROR,
            message: "User not authenticated",
            data: null,
          } as Response<any>;
        }

        const result = await invoke<Response<any>>("export_to_cloud", {
          userId,
          token,
        });
        return result;
      })()
    );
  }

  syncAll(): Observable<Response<any>> {
    return this.exportToCloud().pipe(
      switchMap((exportResult) => {
        if (exportResult.status !== ResponseStatus.SUCCESS) {
          return of(exportResult);
        }
        return this.importFromCloud();
      })
    );
  }

  private getToken(): string | null {
    try {
      const token = sessionStorage.getItem("auth_token");
      return token;
    } catch {
      return null;
    }
  }

  private getUserId(): string | null {
    try {
      const token = this.getToken();
      if (!token) return null;
      const payload = JSON.parse(atob(token.split(".")[1]));
      return payload.userId || payload.sub || null;
    } catch {
      return null;
    }
  }

  getQueueSize(): number {
    return this.offlineQueue.length;
  }

  clearQueue(): void {
    this.offlineQueue = [];
    this.saveQueueToSession();
  }
}
