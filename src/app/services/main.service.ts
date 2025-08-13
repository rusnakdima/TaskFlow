/* sys lib */
import { Injectable } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";

/* models */
import { Response } from "@models/response";

@Injectable({
  providedIn: "root",
})
export class MainService {
  constructor() {}

  async getAll<R>(apiName: string): Promise<Response<R>> {
    return await invoke<Response<R>>(`${apiName}GetAll`);
  }

  async getAllByField<R, D>(apiName: string, name: string, value: D): Promise<Response<R>> {
    return await invoke<Response<R>>(`${apiName}GetAllByField`, { nameField: name, value: value });
  }

  async get<R>(apiName: string, id: string): Promise<Response<R>> {
    return await invoke<Response<R>>(`${apiName}Get`, { id: id });
  }

  async getByField<R, D>(apiName: string, name: string, value: D): Promise<Response<R>> {
    return await invoke<Response<R>>(`${apiName}GetByField`, { nameField: name, value: value });
  }

  async create<R, D>(apiName: string, data: D): Promise<Response<R>> {
    return await invoke<Response<R>>(`${apiName}Create`, { data: data });
  }

  async update<R, D>(apiName: string, id: string, data: D): Promise<Response<R>> {
    return await invoke<Response<R>>(`${apiName}Update`, { id: id, data: data });
  }
  async delete<R>(apiName: string, id: string): Promise<Response<R>> {
    return await invoke<Response<R>>(`${apiName}Delete`, { id: id });
  }
}
