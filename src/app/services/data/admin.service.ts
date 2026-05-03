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
    return from(invoke<Response<R>>("get_all_data_for_admin"));
  }

  getAllDataForArchive<R>(): Observable<Response<R>> {
    return from(invoke<Response<R>>("get_all_data_for_archive"));
  }

  async permanentlyDeleteRecord(table: string, id: string): Promise<Response<void>> {
    return await invoke<Response<void>>("permanently_delete_record", { table, id });
  }

  async permanentlyDeleteRecordLocal(table: string, id: string): Promise<Response<void>> {
    return await invoke<Response<void>>("permanently_delete_record_local", { table, id });
  }

  async toggleDeleteStatus(table: string, id: string): Promise<Response<boolean>> {
    return await invoke<Response<boolean>>("toggle_delete_status", { table, id });
  }

  async toggleDeleteStatusLocal(table: string, id: string): Promise<Response<boolean>> {
    return await invoke<Response<boolean>>("toggle_delete_status_local", { table, id });
  }

  getAdminDataPaginated<R>(type: string, skip: number, limit: number): Observable<Response<R>> {
    return from(invoke<Response<R>>("get_admin_data_paginated", { type, skip, limit }));
  }

  getArchiveDataPaginated<R>(type: string, skip: number, limit: number): Observable<Response<R>> {
    return from(invoke<Response<R>>("get_archive_data_paginated", { type, skip, limit }));
  }
}
