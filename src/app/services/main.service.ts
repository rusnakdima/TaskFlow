/* sys lib */
import { Injectable } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";

/* models */
import { Response } from "@models/response.model";
import { SyncMetadata } from "@models/sync-metadata";

@Injectable({
  providedIn: "root",
})
export class MainService {
  constructor() {}

  async getAll<R>(
    apiName: string,
    filter: object = {},
    syncMetadata?: SyncMetadata
  ): Promise<Response<R>> {
    return await invoke<Response<R>>(`${apiName}GetAll`, {
      filter: filter,
      syncMetadata: syncMetadata,
    });
  }

  async get<R>(
    apiName: string,
    filter: object = {},
    syncMetadata?: SyncMetadata
  ): Promise<Response<R>> {
    return await invoke<Response<R>>(`${apiName}Get`, {
      filter: filter,
      syncMetadata: syncMetadata,
    });
  }

  async create<R, D>(apiName: string, data: D, syncMetadata?: SyncMetadata): Promise<Response<R>> {
    return await invoke<Response<R>>(`${apiName}Create`, {
      data: data,
      syncMetadata: syncMetadata,
    });
  }

  async update<R, D>(
    apiName: string,
    id: string,
    data: D,
    syncMetadata?: SyncMetadata
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
    syncMetadata?: SyncMetadata
  ): Promise<Response<R>> {
    return await invoke<Response<R>>(`${apiName}UpdateAll`, {
      data: data,
      syncMetadata: syncMetadata,
    });
  }

  async delete<R>(apiName: string, id: string, syncMetadata?: SyncMetadata): Promise<Response<R>> {
    return await invoke<Response<R>>(`${apiName}Delete`, { id: id, syncMetadata: syncMetadata });
  }

  async getTodosByAssignee<R>(profieId: string): Promise<Response<R>> {
    return await invoke<Response<R>>("todoGetByAssignee", { assigneeId: profieId });
  }
}
