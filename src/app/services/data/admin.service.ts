/* sys lib */
import { Injectable, inject } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";
import { Observable, from } from "rxjs";

/* models */
import { Response } from "@models/response.model";
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { ApiService } from "@services/api.service";

@Injectable({
  providedIn: "root",
})
export class AdminService {
  private jwtTokenService = inject(JwtTokenService);
  private apiService = inject(ApiService);

  constructor() {}

  getAllDataForAdmin<R>(): Observable<Response<R>> {
    const token = this.jwtTokenService.getToken();
    return from(invoke<Response<R>>("get_all_admin_data", { token }));
  }

  getAllDataForArchive<R>(): Observable<Response<R>> {
    const token = this.jwtTokenService.getToken();
    return from(invoke<Response<R>>("get_all_archive_data", { token }));
  }

  getAllArchiveData<R>(): Observable<Response<R>> {
    return this.apiService.admin.getAllArchiveData() as Observable<Response<R>>;
  }

  getAllAdminData<R>(): Observable<Response<R>> {
    return this.apiService.admin.getAllAdminData() as Observable<Response<R>>;
  }

  async permanentlyDeleteRecord(
    table: string,
    id: string,
    visibility?: string
  ): Promise<Response<void>> {
    const token = this.jwtTokenService.getToken();
    return await invoke<Response<void>>("permanent_delete", { table, id, token, visibility });
  }

  async permanentlyDeleteRecordLocal(
    table: string,
    id: string,
    visibility: string = "private"
  ): Promise<Response<void>> {
    const token = this.jwtTokenService.getToken();
    return await invoke<Response<void>>("permanent_delete", { table, id, token, visibility });
  }

  async toggleDeleteStatus(
    table: string,
    id: string,
    visibility?: string
  ): Promise<Response<boolean>> {
    const token = this.jwtTokenService.getToken();
    return await invoke<Response<boolean>>("soft_delete", { table, id, token, visibility });
  }

  async toggleDeleteStatusLocal(
    table: string,
    id: string,
    visibility: string = "private"
  ): Promise<Response<boolean>> {
    const token = this.jwtTokenService.getToken();
    return await invoke<Response<boolean>>("soft_delete", { table, id, token, visibility });
  }

  getAdminDataPaginated<R>(type: string, skip: number, limit: number): Observable<Response<R>> {
    const token = this.jwtTokenService.getToken();
    return from(
      invoke<Response<R>>("get_all_admin_paginated", { data_type: type, skip, limit, token })
    );
  }

  getArchiveDataPaginated<R>(type: string, skip: number, limit: number): Observable<Response<R>> {
    const token = this.jwtTokenService.getToken();
    return from(
      invoke<Response<R>>("get_all_archive_paginated", { data_type: type, skip, limit, token })
    );
  }
}
