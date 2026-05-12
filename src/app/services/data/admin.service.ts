/* sys lib */
import { Injectable, inject } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";
import { Observable, from } from "rxjs";

/* models */
import { Response } from "@models/response.model";
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { TypedApiService } from "@services/typed-api.service";

@Injectable({
  providedIn: "root",
})
export class AdminService {
  private jwtTokenService = inject(JwtTokenService);
  private typedApiService = inject(TypedApiService);

  constructor() {}

  getAllDataForAdmin<R>(): Observable<Response<R>> {
    const token = this.jwtTokenService.getToken();
    return from(invoke<Response<R>>("admin_get_all", { token }));
  }

  getAllDataForArchive<R>(): Observable<Response<R>> {
    const token = this.jwtTokenService.getToken();
    return from(invoke<Response<R>>("admin_get_all_archive", { token }));
  }

  getAllArchiveData<R>(): Observable<Response<R>> {
    return this.typedApiService.getAllArchiveData() as Observable<Response<R>>;
  }

  getAllAdminData<R>(): Observable<Response<R>> {
    return this.typedApiService.getAllAdminData() as Observable<Response<R>>;
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
