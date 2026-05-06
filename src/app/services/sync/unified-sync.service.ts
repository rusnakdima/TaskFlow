/* sys lib */
import { Injectable, OnDestroy } from "@angular/core";
import { Observable, of, Subject, BehaviorSubject, from } from "rxjs";
import { switchMap, take } from "rxjs/operators";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

/* models */
import { Response, ResponseStatus } from "@models/response.model";

/* helpers */
import { TokenStorageHelper } from "@helpers/token-storage.helper";

/* services */
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { DataService } from "@services/data/data.service";
import { NotifyService } from "@services/notifications/notify.service";
import { SyncProgressService } from "@services/core/sync-progress.service";

export interface QueuedOperation {
  id: string;
  operation: "create" | "update" | "delete";
  table: string;
  data?: any;
  timestamp: number;
  retries: number;
}

export interface SyncProgress {
  isSyncing: boolean;
  currentStep: "export" | "import" | "complete" | "error";
  progress: number;
  message: string;
  error?: string;
}

@Injectable({
  providedIn: "root",
})
export class UnifiedSyncService implements OnDestroy {
  private offlineQueue: QueuedOperation[] = [];
  private readonly MAX_RETRIES = 3;
  private readonly DEFAULT_SYNC_INTERVAL = 30000;
  private syncIntervalId?: number;

  private onlineStatusSubject = new Subject<boolean>();
  private dbChangeSubjects: Map<string, Subject<any>> = new Map();
  private tauriUnlisteners: UnlistenFn[] = [];
  private networkUnlisteners: (() => void)[] = [];

  private readonly QUEUE_STORAGE_KEY = "taskflow_offline_queue";

  private isSyncingSubject = new BehaviorSubject<boolean>(false);
  private progressSubject = new BehaviorSubject<SyncProgress>({
    isSyncing: false,
    currentStep: "complete",
    progress: 0,
    message: "Ready to sync",
  });

  constructor(
    private jwtTokenService: JwtTokenService,
    private dataService: DataService,
    private notifyService: NotifyService,
    private syncProgressService: SyncProgressService
  ) {
    this.loadQueueFromSession();
    this.initNetworkListeners();
    this.initDbChangeSubjects();
  }

  ngOnDestroy(): void {
    this.stopPeriodicSync();
    this.tauriUnlisteners.forEach((unlisten) => unlisten());
    this.tauriUnlisteners = [];
    this.networkUnlisteners.forEach((unlisten) => unlisten());
    this.networkUnlisteners = [];
  }

  get isSyncing$(): Observable<boolean> {
    return this.isSyncingSubject.asObservable();
  }

  get progress$(): Observable<SyncProgress> {
    return this.progressSubject.asObservable();
  }

  get onlineStatus$(): Observable<boolean> {
    return this.onlineStatusSubject.asObservable();
  }

  private isOnline(): boolean {
    return navigator.onLine;
  }

  private initNetworkListeners(): void {
    const onlineHandler = () => {
      this.onlineStatusSubject.next(true);
      this.processOfflineQueue();
      this.startPeriodicSync();
    };

    const offlineHandler = () => {
      this.onlineStatusSubject.next(false);
      this.stopPeriodicSync();
    };

    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);

    this.networkUnlisteners.push(() => window.removeEventListener("online", onlineHandler));
    this.networkUnlisteners.push(() => window.removeEventListener("offline", offlineHandler));
  }

  private initDbChangeSubjects(): void {
    const collections = ["todos", "tasks", "subtasks", "comments", "chats", "categories"];
    collections.forEach((collection) => {
      this.dbChangeSubjects.set(collection, new Subject<any>());
    });
  }

  async initTauriListeners(): Promise<void> {
    const collections = ["todos", "tasks", "subtasks", "comments", "chats", "categories"];

    for (const collection of collections) {
      const unlisten = await listen(`db-change-${collection}`, (event: any) => {
        const subject = this.dbChangeSubjects.get(collection);
        if (subject) {
          const payload = event.payload;
          const operationType = this.mapOperationType(payload.operationType);
          subject.next({
            operationType,
            data: payload.data,
            collection,
          });
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

  getQueueSize(): number {
    return this.offlineQueue.length;
  }

  clearQueue(): void {
    this.offlineQueue = [];
    this.saveQueueToSession();
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

  setSyncing(isSyncing: boolean): void {
    this.isSyncingSubject.next(isSyncing);
    this.progressSubject.next({
      ...this.progressSubject.value,
      isSyncing,
    });
  }

  private updateProgress(progress: Partial<SyncProgress>): void {
    this.progressSubject.next({
      ...this.progressSubject.value,
      ...progress,
    });
  }

  async importToLocal<R>(): Promise<Response<R>> {
    this.setSyncing(true);
    this.updateProgress({
      currentStep: "import",
      progress: 10,
      message: "Importing from cloud...",
    });

    try {
      const token = TokenStorageHelper.getToken();
      const userId = this.jwtTokenService.getUserId(token);

      if (!userId) {
        this.notifyService.showError("User not authenticated");
        this.setSyncing(false);
        return {
          status: ResponseStatus.ERROR,
          message: "User not authenticated",
          data: null as unknown as R,
        };
      }

      this.updateProgress({ progress: 50, message: "Downloading data from cloud..." });

      const result = await invoke<Response<R>>("import_to_local", { userId: userId, token });

      if (result.status === ResponseStatus.SUCCESS) {
        this.updateProgress({ progress: 100, message: "Import complete" });
        this.notifyService.showSuccess("Data imported successfully from cloud");
      } else {
        this.updateProgress({
          currentStep: "error",
          message: "Import failed",
          error: result.message,
        });
        this.notifyService.showError(result.message || "Failed to import data");
      }
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.updateProgress({
        currentStep: "error",
        message: "Import failed",
        error: errorMessage,
      });
      this.notifyService.showError(errorMessage);
      throw error;
    } finally {
      this.setSyncing(false);
    }
  }

  async exportToCloud<R>(): Promise<Response<R>> {
    this.setSyncing(true);
    this.updateProgress({ currentStep: "export", progress: 10, message: "Exporting to cloud..." });

    try {
      const token = TokenStorageHelper.getToken();
      const userId = this.jwtTokenService.getUserId(token);

      if (!userId) {
        this.notifyService.showError("User not authenticated");
        this.setSyncing(false);
        return {
          status: ResponseStatus.ERROR,
          message: "User not authenticated",
          data: null as unknown as R,
        };
      }

      this.updateProgress({ progress: 50, message: "Uploading data to cloud..." });

      const result = await invoke<Response<R>>("export_to_cloud", { userId: userId, token });

      if (result.status === ResponseStatus.SUCCESS) {
        this.updateProgress({ progress: 100, message: "Export complete" });
        this.notifyService.showSuccess("Data exported successfully to cloud");
      } else {
        this.updateProgress({
          currentStep: "error",
          message: "Export failed",
          error: result.message,
        });
        this.notifyService.showError(result.message || "Failed to export data");
      }
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.updateProgress({
        currentStep: "error",
        message: "Export failed",
        error: errorMessage,
      });
      this.notifyService.showError(errorMessage);
      throw error;
    } finally {
      this.setSyncing(false);
    }
  }

  syncAll<R>(): Promise<Response<R>> {
    return this.syncAllWithProgress<R>();
  }

  syncAllWithProgress<R>(): Promise<Response<R>> {
    this.setSyncing(true);
    this.syncProgressService.startSync("sync", "Starting full sync...", 100);
    this.updateProgress({ currentStep: "export", progress: 5, message: "Starting sync..." });

    return (async () => {
      try {
        this.updateProgress({
          currentStep: "export",
          progress: 10,
          message: "Exporting to cloud...",
        });
        this.syncProgressService.updateProgress(10, "Exporting to cloud...");
        const exportResult = await this.exportToCloud<R>();

        if (exportResult.status !== ResponseStatus.SUCCESS) {
          this.updateProgress({
            currentStep: "error",
            progress: 50,
            message: "Export failed - sync aborted",
            error: exportResult.message,
          });
          this.syncProgressService.reset();
          return exportResult;
        }

        this.updateProgress({
          currentStep: "import",
          progress: 55,
          message: "Importing from cloud...",
        });
        this.syncProgressService.updateProgress(55, "Importing from cloud...");
        const importResult = await this.importToLocal<R>();

        if (importResult.status === ResponseStatus.SUCCESS) {
          this.updateProgress({
            currentStep: "complete",
            progress: 100,
            message: "Sync complete - all data up to date",
          });
          this.syncProgressService.endSync();
        }

        return importResult;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.updateProgress({
          currentStep: "error",
          message: "Sync failed",
          error: errorMessage,
        });
        this.syncProgressService.reset();
        throw error;
      } finally {
        this.setSyncing(false);
      }
    })();
  }

  importFromCloudObservable(): Observable<Response<any>> {
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

  exportToCloudObservable(): Observable<Response<any>> {
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

  resolveConflict<T extends { updatedAt: string }>(local: T, remote: T): T {
    const localTime = new Date(local.updatedAt).getTime();
    const remoteTime = new Date(remote.updatedAt).getTime();
    return remoteTime > localTime ? remote : local;
  }

  async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000
  ): Promise<T> {
    let lastError: Error | null = null;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        if (i < maxRetries - 1) {
          await this.sleep(Math.pow(2, i) * delayMs);
        }
      }
    }
    throw lastError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Aliases for backwards compatibility with old imports
export const DataSyncService = UnifiedSyncService;
export const SyncService = UnifiedSyncService;
