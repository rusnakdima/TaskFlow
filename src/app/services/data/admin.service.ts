/* sys lib */
import { Injectable } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";
import { Observable, from } from "rxjs";

/* models */
import { Response } from "@models/response.model";

/* services */
import { AuthService } from "@services/auth/auth.service";

@Injectable({
  providedIn: "root",
})
export class AdminService {
  constructor(private authService: AuthService) {}

  getAllDataForAdmin<R>(): Observable<Response<R>> {
    return from(invoke<Response<R>>("getAllDataForAdmin"));
  }

  getAllDataForArchive<R>(): Observable<Response<R>> {
    return from(invoke<Response<R>>("getAllDataForArchive"));
  }

  async permanentlyDeleteRecord(table: string, id: string): Promise<Response<void>> {
    return await invoke<Response<void>>("permanentlyDeleteRecord", { table, id });
  }

  async permanentlyDeleteRecordWithCascade(table: string, id: string): Promise<Response<void>> {
    return await invoke<Response<void>>("permanentlyDeleteRecordWithCascade", { table, id });
  }

  async toggleDeleteStatus(table: string, id: string): Promise<Response<void>> {
    return await invoke<Response<void>>("toggleDeleteStatus", { table, id });
  }
}
