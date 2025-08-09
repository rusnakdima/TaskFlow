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
    return await invoke<Response<R>>(`${apiName}_get_all`);
  }

  async get<R>(apiName: string, id: string): Promise<Response<R>> {
    return await invoke<Response<R>>(`${apiName}_get`, { id: id });
  }

  async create<R, D>(apiName: string, data: D): Promise<Response<R>> {
    return await invoke<Response<R>>(`${apiName}_create`, { data: data });
  }

  async update<R, D>(apiName: string, id: string, data: D): Promise<Response<R>> {
    return await invoke<Response<R>>(`${apiName}_update`, { id: id, data: data });
  }
  async delete<R>(apiName: string, id: string): Promise<Response<R>> {
    return await invoke<Response<R>>(`${apiName}_delete`, { id: id });
  }
}
