/* sys lib */
import { Injectable } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";

/* models */
import { Response } from "@models/response.model";

@Injectable({
  providedIn: "root",
})
export class MainService {
  constructor() {}

  async getAllByField<R>(
    apiName: string,
    filter: object = {},
    syncMetadata?: { isOwner: boolean; isPrivate: boolean }
  ): Promise<Response<R>> {
    return await invoke<Response<R>>(`${apiName}GetAllByField`, {
      filter: filter,
      syncMetadata: syncMetadata,
    });
  }

  async getByField<R>(
    apiName: string,
    filter: object = {},
    syncMetadata?: { isOwner: boolean; isPrivate: boolean }
  ): Promise<Response<R>> {
    return await invoke<Response<R>>(`${apiName}GetByField`, {
      filter: filter,
      syncMetadata: syncMetadata,
    });
  }

  async create<R, D>(
    apiName: string,
    data: D,
    syncMetadata?: { isOwner: boolean; isPrivate: boolean }
  ): Promise<Response<R>> {
    return await invoke<Response<R>>(`${apiName}Create`, {
      data: data,
      syncMetadata: syncMetadata,
    });
  }

  async update<R, D>(
    apiName: string,
    id: string,
    data: D,
    syncMetadata?: { isOwner: boolean; isPrivate: boolean }
  ): Promise<Response<R>> {
    return await invoke<Response<R>>(`${apiName}Update`, {
      id: id,
      data: data,
      syncMetadata: syncMetadata,
    });
  }

  async updateAll<R, D>(
    apiName: string,
    data: Array<D>,
    syncMetadata?: { isOwner: boolean; isPrivate: boolean }
  ): Promise<Response<R>> {
    return await invoke<Response<R>>(`${apiName}UpdateAll`, {
      data: data,
      syncMetadata: syncMetadata,
    });
  }

  async delete<R>(
    apiName: string,
    id: string,
    syncMetadata?: { isOwner: boolean; isPrivate: boolean }
  ): Promise<Response<R>> {
    return await invoke<Response<R>>(`${apiName}Delete`, { id: id, syncMetadata: syncMetadata });
  }

  async getTodosByAssignee<R>(profieId: string): Promise<Response<R>> {
    return await invoke<Response<R>>("todoGetByAssignee", { assigneeId: profieId });
  }
}
