import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";

/* services */
import { ApiProvider } from "@providers/api.provider";

export interface RelationLoadingStats {
  totalQueries: number;
  loadTimeMs: number;
}

@Injectable({
  providedIn: "root",
})
export class RelationLoadingService {
  private stats: RelationLoadingStats = {
    totalQueries: 0,
    loadTimeMs: 0,
  };

  constructor() {}

  load<T>(
    provider: ApiProvider,
    table: string,
    id: string,
    load: string[],
    visibility?: string
  ): Observable<T> {
    const startTime = Date.now();

    return provider
      .crud<T>("get", table, {
        id,
        load,
        visibility,
      })
      .pipe(
        tap(() => {
          const elapsed = Date.now() - startTime;
          this.stats.totalQueries++;
          this.stats.loadTimeMs += elapsed;
        })
      );
  }

  loadMany<T>(
    provider: ApiProvider,
    table: string,
    filter: { [key: string]: any },
    load: string[],
    visibility?: string
  ): Observable<T[]> {
    const startTime = Date.now();

    return provider
      .crud<T[]>("getAll", table, {
        filter,
        load,
        visibility,
      })
      .pipe(
        tap(() => {
          const elapsed = Date.now() - startTime;
          this.stats.totalQueries++;
          this.stats.loadTimeMs += elapsed;
        })
      );
  }

  loadOne<T>(
    provider: ApiProvider,
    table: string,
    filter: { [key: string]: any },
    load: string[],
    visibility?: string
  ): Observable<T | null> {
    const startTime = Date.now();

    return provider
      .crud<T>("get", table, {
        filter,
        load,
        visibility,
      })
      .pipe(
        tap(() => {
          const elapsed = Date.now() - startTime;
          this.stats.totalQueries++;
          this.stats.loadTimeMs += elapsed;
        })
      );
  }

  getStats(): RelationLoadingStats {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = {
      totalQueries: 0,
      loadTimeMs: 0,
    };
  }
}
