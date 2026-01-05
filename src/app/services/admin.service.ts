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
export class AdminService {
  constructor(private authService: AuthService) {}

  async getAllDataForAdmin<R>(): Promise<Response<R>> {
    return await invoke<Response<R>>("getAllDataForAdmin");
  }

  async permanentlyDeleteRecord(table: string, id: string): Promise<Response<void>> {
    return await invoke<Response<void>>("permanentlyDeleteRecord", { table, id });
  }
}
