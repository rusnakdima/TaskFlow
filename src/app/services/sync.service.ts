/* sys lib */
import { Injectable } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";

/* models */
import { Response } from "@models/response.model";

/* services */
import { AuthService } from "@services/auth.service";

@Injectable({
  providedIn: "root",
})
export class SyncService {
  constructor(private authService: AuthService) {}

  async importToLocal<R>(): Promise<Response<R>> {
    const userId = this.authService.getValueByKey("id");
    return await invoke<Response<R>>("importToLocal", { userId });
  }

  async exportToCloud<R>(): Promise<Response<R>> {
    const userId = this.authService.getValueByKey("id");
    return await invoke<Response<R>>("exportToCloud", { userId });
  }

  async syncAll<R>(): Promise<Response<R>> {
    const exportResult = await this.exportToCloud<R>();
    if (exportResult.status !== "Success") {
      return exportResult;
    }

    const importResult = await this.importToLocal<R>();
    return importResult;
  }
}
