/* sys lib */
import { Injectable, inject } from "@angular/core";
import { Observable, firstValueFrom, from } from "rxjs";
/* models */
import { Response, ResponseModel } from "@entities/response.model";
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { ApiService } from "@api/api.service";
import { InvokeWrapperService } from "@tauri-front/shared";
@Injectable({
  providedIn: "root",
})
export class AdminService {
  private jwtTokenService = inject(JwtTokenService);
  private apiService = inject(ApiService);
  private invoke = inject(InvokeWrapperService);
  constructor() {}
  getAllDataForAdmin<R>(): Observable<Response<R>> {
    const token = this.jwtTokenService.getToken();
    return from(this.invoke.invoke<Response<R>>("get_all_admin_data", { token }));
  }
  getAllDataForArchive<R>(): Observable<Response<R>> {
    const token = this.jwtTokenService.getToken();
    return from(this.invoke.invoke<Response<R>>("get_all_archive_data", { token }));
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
  ): Promise<ResponseModel<void>> {
    const token = this.jwtTokenService.getToken();
    return await firstValueFrom(
      from(
        this.invoke.invoke<ResponseModel<void>>("permanent_delete", {
          table,
          id,
          token,
          visibility,
        })
      )
    );
  }
  async permanentlyDeleteRecordLocal(
    table: string,
    id: string,
    visibility: string = "private"
  ): Promise<ResponseModel<void>> {
    const token = this.jwtTokenService.getToken();
    return await firstValueFrom(
      from(
        this.invoke.invoke<ResponseModel<void>>("permanent_delete", {
          table,
          id,
          token,
          visibility,
        })
      )
    );
  }
  async toggleDeleteStatus(
    table: string,
    id: string,
    todoId: string,
    visibility?: string
  ): Promise<ResponseModel<boolean>> {
    const token = this.jwtTokenService.getToken();
    return await firstValueFrom(
      from(
        this.invoke.invoke<ResponseModel<boolean>>("soft_delete", {
          table,
          id,
          token,
          todoId,
          visibility,
        })
      )
    );
  }
  async toggleDeleteStatusLocal(
    table: string,
    id: string,
    todoId: string = "",
    visibility: string = "private"
  ): Promise<ResponseModel<boolean>> {
    const token = this.jwtTokenService.getToken();
    return await firstValueFrom(
      from(
        this.invoke.invoke<ResponseModel<boolean>>("soft_delete", {
          table,
          id,
          token,
          todoId,
          visibility,
        })
      )
    );
  }
  getAdminDataPaginated<R>(type: string, skip: number, limit: number): Observable<Response<R>> {
    const token = this.jwtTokenService.getToken();
    return from(
      this.invoke.invoke<Response<R>>("get_all_admin_paginated", {
        dataType: type,
        skip,
        limit,
        token,
      })
    );
  }
  getArchiveDataPaginated<R>(type: string, skip: number, limit: number): Observable<Response<R>> {
    const token = this.jwtTokenService.getToken();
    return from(
      this.invoke.invoke<Response<R>>("get_all_archive_paginated", {
        dataType: type,
        skip,
        limit,
        token,
      })
    );
  }
}
