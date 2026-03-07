/* sys lib */
import { Injectable } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";
import { BehaviorSubject, Observable } from "rxjs";

/* models */
import { Response, ResponseStatus } from "@models/response.model";

/* services */
import { AuthService } from "@services/auth.service";
import { StorageService } from "@services/storage.service";

@Injectable({
  providedIn: "root",
})
export class SyncService {
  private isSyncingSubject = new BehaviorSubject<boolean>(false);

  constructor(
    private authService: AuthService,
    private storageService: StorageService
  ) {}

  get isSyncing$(): Observable<boolean> {
    return this.isSyncingSubject.asObservable();
  }

  setSyncing(isSyncing: boolean): void {
    this.isSyncingSubject.next(isSyncing);
  }

  async importToLocal<R>(): Promise<Response<R>> {
    this.setSyncing(true);
    try {
      const userId = this.authService.getValueByKey("id");
      const result = await invoke<Response<R>>("importToLocal", { userId });
      if (result.status === ResponseStatus.SUCCESS) {
        this.storageService.loadAllData(true).subscribe();
      }
      return result;
    } finally {
      this.setSyncing(false);
    }
  }

  async exportToCloud<R>(): Promise<Response<R>> {
    this.setSyncing(true);
    try {
      const userId = this.authService.getValueByKey("id");
      const result = await invoke<Response<R>>("exportToCloud", { userId });
      return result;
    } finally {
      this.setSyncing(false);
    }
  }

  async syncAll<R>(): Promise<Response<R>> {
    this.setSyncing(true);
    try {
      const importResult = await this.importToLocal<R>();
      if (importResult.status !== ResponseStatus.SUCCESS) {
        return importResult;
      }

      const exportResult = await this.exportToCloud<R>();
      return exportResult;
    } finally {
      this.setSyncing(false);
    }
  }
}
