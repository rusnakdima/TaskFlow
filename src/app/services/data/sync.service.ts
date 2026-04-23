/* sys lib */
import { Injectable, DestroyRef, OnDestroy } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";
import { BehaviorSubject, Observable, Subscription } from "rxjs";

/* models */
import { Response, ResponseStatus } from "@models/response.model";

/* services */
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { StorageService } from "@services/core/storage.service";
import { DataLoaderService } from "@services/data/data-loader.service";
import { NotifyService } from "@services/notifications/notify.service";
import { SyncProgressService } from "@services/core/sync-progress.service";

export interface SyncProgress {
  isSyncing: boolean;
  currentStep: "export" | "import" | "complete" | "error";
  progress: number; // 0-100
  message: string;
  error?: string;
}

@Injectable({
  providedIn: "root",
})
export class SyncService implements OnDestroy {
  private isSyncingSubject = new BehaviorSubject<boolean>(false);
  private progressSubject = new BehaviorSubject<SyncProgress>({
    isSyncing: false,
    currentStep: "complete",
    progress: 0,
    message: "Ready to sync",
  });
  private dataSubscription: Subscription | null = null;

  constructor(
    private jwtTokenService: JwtTokenService,
    private storageService: StorageService,
    private dataSyncService: DataLoaderService,
    private notifyService: NotifyService,
    private syncProgressService: SyncProgressService
  ) {}

  get isSyncing$(): Observable<boolean> {
    return this.isSyncingSubject.asObservable();
  }

  get progress$(): Observable<SyncProgress> {
    return this.progressSubject.asObservable();
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
      const token = localStorage.getItem("token") || sessionStorage.getItem("token");
      const userId = this.jwtTokenService.getUserId(token);

      this.updateProgress({ progress: 50, message: "Downloading data from cloud..." });

      const result = await invoke<Response<R>>("import_to_local", { user_id: userId });

      if (result.status === ResponseStatus.SUCCESS) {
        this.updateProgress({ progress: 90, message: "Updating local data..." });
        this.unsubscribeData();
        this.dataSubscription = this.dataSyncService.loadAllData(true).subscribe();
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
      const token = localStorage.getItem("token") || sessionStorage.getItem("token");
      const userId = this.jwtTokenService.getUserId(token);

      this.updateProgress({ progress: 50, message: "Uploading data to cloud..." });

      const result = await invoke<Response<R>>("export_to_cloud", { user_id: userId });

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

  async syncAll<R>(): Promise<Response<R>> {
    this.setSyncing(true);
    this.syncProgressService.startSync("sync", "Starting full sync...", 100);
    this.updateProgress({ currentStep: "export", progress: 5, message: "Starting sync..." });

    try {
      // Step 1: Export to cloud
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

      // Step 2: Import from cloud
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
  }

  // ==================== Last-Write-Wins Conflict Resolution ====================

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

  private unsubscribeData(): void {
    if (this.dataSubscription) {
      this.dataSubscription.unsubscribe();
      this.dataSubscription = null;
    }
  }

  ngOnDestroy(): void {
    this.unsubscribeData();
  }
}
