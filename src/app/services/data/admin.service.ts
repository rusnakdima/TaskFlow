/* sys lib */
import { Injectable, inject } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";
import { Observable, from } from "rxjs";

/* models */
import { Response } from "@models/response.model";
import { JwtTokenService } from "@services/auth/jwt-token.service";

@Injectable({
  providedIn: "root",
})
export class AdminService {
  private jwtTokenService = inject(JwtTokenService);

  constructor() {}

  getAllDataForAdmin<R>(): Observable<Response<R>> {
    const token = this.jwtTokenService.getToken();
    return from(invoke<Response<R>>("admin_get_all", { token }));
  }

  getAllDataForArchive<R>(): Observable<Response<R>> {
    const token = this.jwtTokenService.getToken();
    return from(invoke<Response<R>>("admin_get_all_archive", { token }));
  }

  async permanentlyDeleteRecord(table: string, id: string): Promise<Response<void>> {
    const token = this.jwtTokenService.getToken();
    return await invoke<Response<void>>("admin_permanently_delete", { table, id, token });
  }

  async permanentlyDeleteRecordLocal(table: string, id: string): Promise<Response<void>> {
    const token = this.jwtTokenService.getToken();
    return await invoke<Response<void>>("admin_permanently_delete_local", { table, id, token });
  }

  async toggleDeleteStatus(table: string, id: string): Promise<Response<boolean>> {
    const token = this.jwtTokenService.getToken();
    return await invoke<Response<boolean>>("admin_toggle_delete", { table, id, token });
  }

  async toggleDeleteStatusLocal(table: string, id: string): Promise<Response<boolean>> {
    const token = this.jwtTokenService.getToken();
    return await invoke<Response<boolean>>("admin_toggle_delete_local", { table, id, token });
  }

  getAdminDataPaginated<R>(type: string, skip: number, limit: number): Observable<Response<R>> {
    const token = this.jwtTokenService.getToken();
    return from(
      invoke<Response<R>>("admin_get_paginated", { data_type: type, skip, limit, token })
    );
  }

  getArchiveDataPaginated<R>(type: string, skip: number, limit: number): Observable<Response<R>> {
    const token = this.jwtTokenService.getToken();
    return from(
      invoke<Response<R>>("admin_get_archive_paginated", { data_type: type, skip, limit, token })
    );
  }
}
