import { Injectable } from "@angular/core";
import { Observable, of } from "rxjs";
import { tap, catchError } from "rxjs/operators";

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
        tap((result) => {
          const elapsed = Date.now() - startTime;
          this.stats.totalQueries++;
          this.stats.loadTimeMs += elapsed;
        }),
        catchError((err: unknown) => {
          return of(null as unknown as T[]);
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
