import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";
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

  execute<T = unknown>(operation: string, entity: string, params: CrudParams = {}): Observable<T> {
    return this.api.invoke<T>("crud_execute", {
      operation,
      entity,
      id: params.id,
      data: params.data,
      filter: params.filter,
    });
  }

  get<T = unknown>(entity: string, id: string): Observable<T> {
    return this.execute<T>("get", entity, { id });
  }

  getAll<T = unknown>(entity: string, filter?: unknown): Observable<T[]> {
    return new Observable((subscriber) => {
      this.api
        .invoke<Response<{ [key: string]: T[] }>>("crud_execute", {
          operation: "get_all",
          entity,
          filter,
        })
        .subscribe({
          next: (response) => {
            const values = Object.values(response?.data ?? {})[0] ?? [];
            subscriber.next(values);
            subscriber.complete();
          },
          error: (err) => subscriber.error(err),
        });
    });
  }

  create<T = unknown>(entity: string, data: unknown): Observable<T> {
    return this.execute<T>("create", entity, { data });
  }

  update<T = unknown>(entity: string, id: string, data: unknown): Observable<T> {
    return this.execute<T>("update", entity, { id, data });
  }

  patch<T = unknown>(entity: string, id: string, data: unknown): Observable<T> {
    return this.execute<T>("patch", entity, { id, data });
  }

  delete(entity: string, id: string): Observable<void> {
    return this.execute<void>("delete", entity, { id });
  }
}
