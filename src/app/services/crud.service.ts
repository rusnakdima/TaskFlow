import { Injectable, inject } from "@angular/core";
import { firstValueFrom } from "rxjs";
import { TauriApiService } from "@app/api/tauri-api.service";
import { Response } from "@entities/response.model";

export interface CrudParams {
  id?: string;
  data?: unknown;
  filter?: unknown;
}

@Injectable({
  providedIn: "root",
})
export class CrudService {
  private api = inject(TauriApiService);

  async execute<T = unknown>(
    operation: string,
    entity: string,
    params: CrudParams = {}
  ): Promise<T> {
    return firstValueFrom(
      this.api.invoke<Response<T>>("crud_execute", {
        operation,
        entity,
        id: params.id,
        data: params.data,
        filter: params.filter,
      })
    ).then((response) => response as unknown as T);
  }

  async get<T = unknown>(entity: string, id: string): Promise<T | null> {
    const result = await this.execute<{ data?: T }>("find", entity, { filter: { id } });
    return result.data ?? null;
  }

  async getAll<T = unknown>(entity: string, filter?: unknown): Promise<T[]> {
    const result = await this.execute<{ [key: string]: T[] }>("find", entity, {
      filter: filter as Record<string, unknown>,
    });
    return Object.values(result)[0] ?? [];
  }

  async create<T = unknown>(entity: string, data: unknown): Promise<T> {
    const result = await this.execute<{ data: T }>("create", entity, { data });
    return result.data;
  }

  async update<T = unknown>(entity: string, id: string, data: unknown): Promise<T> {
    const result = await this.execute<{ data: T }>("update", entity, { id, data });
    return result.data;
  }

  async patch<T = unknown>(entity: string, id: string, data: unknown): Promise<T> {
    const result = await this.execute<{ data: T }>("patch", entity, { id, data });
    return result.data;
  }

  async delete(entity: string, id: string): Promise<void> {
    await this.execute("delete", entity, { id });
  }

  async count(entity: string): Promise<number> {
    const result = await this.execute<{ count: number }>("count", entity);
    return result.count;
  }

  async exists(entity: string, id: string): Promise<boolean> {
    const result = await this.execute<{ exists: boolean }>("exists", entity, { id });
    return result.exists;
  }
}
