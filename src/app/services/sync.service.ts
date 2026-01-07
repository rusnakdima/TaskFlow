/* sys lib */
import { Injectable } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";
import { BehaviorSubject, Observable } from "rxjs";

/* models */
import { Response } from "@models/response.model";

/* services */
import { AuthService } from "@services/auth.service";

@Injectable({
  providedIn: "root",
})
export class SyncService {
  private isSyncingSubject = new BehaviorSubject<boolean>(false);

  constructor(private authService: AuthService) {}

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
      const exportResult = await this.exportToCloud<R>();
      if (exportResult.status !== "Success") {
        return exportResult;
      }

      const importResult = await this.importToLocal<R>();
      return importResult;
    } finally {
      this.setSyncing(false);
    }
  }
}
