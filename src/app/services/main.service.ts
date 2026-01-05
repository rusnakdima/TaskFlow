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
    name: string = "",
    value: string = ""
  ): Promise<Response<R>> {
    return await invoke<Response<R>>(`${apiName}GetAllByField`, { nameField: name, value: value });
  }

  async getByField<R>(
    apiName: string,
    name: string = "",
    value: string = ""
  ): Promise<Response<R>> {
    return await invoke<Response<R>>(`${apiName}GetByField`, { nameField: name, value: value });
  }

  async create<R, D>(apiName: string, data: D): Promise<Response<R>> {
    return await invoke<Response<R>>(`${apiName}Create`, { data: data });
  }

  async update<R, D>(apiName: string, id: string, data: D): Promise<Response<R>> {
    return await invoke<Response<R>>(`${apiName}Update`, { id: id, data: data });
  }

  async updateAll<R, D>(apiName: string, data: Array<D>): Promise<Response<R>> {
    return await invoke<Response<R>>(`${apiName}UpdateAll`, { data: data });
  }

  async delete<R>(apiName: string, id: string): Promise<Response<R>> {
    return await invoke<Response<R>>(`${apiName}Delete`, { id: id });
  }

  async getTodosByAssignee<R>(profieId: string): Promise<Response<R>> {
    return await invoke<Response<R>>("todoGetByAssignee", { assigneeId: profieId });
  }
}
