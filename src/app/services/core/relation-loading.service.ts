import { Injectable, inject } from "@angular/core";
import { Observable, of } from "rxjs";
import { tap, catchError } from "rxjs/operators";

/* services */
import { REQUEST_SERVICE } from "@services/api.service";

export interface RelationLoadingStats {
  totalQueries: number;
  loadTimeMs: number;
}

@Injectable({
  providedIn: "root",
})
export class RelationLoadingService {
  private requestService = inject(REQUEST_SERVICE);

  private stats: RelationLoadingStats = {
    totalQueries: 0,
    loadTimeMs: 0,
  };

  constructor() {}

  load<T>(table: string, id: string, load: string[], visibility?: string): Observable<T> {
    const startTime = Date.now();

    return this.requestService.get<T>(table, id, { load, visibility: visibility as any }).pipe(
      tap(() => {
        const elapsed = Date.now() - startTime;
        this.stats.totalQueries++;
        this.stats.loadTimeMs += elapsed;
      })
    );
  }

  loadMany<T>(
    table: string,
    filter: { [key: string]: any },
    load: string[],
    visibility?: string
  ): Observable<T[]> {
    const startTime = Date.now();

    return this.requestService
      .getAll<T>(table, { filter, load, visibility: visibility as any })
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
    table: string,
    filter: { [key: string]: any },
    load: string[],
    visibility?: string
  ): Observable<T | null> {
    const startTime = Date.now();

    return this.requestService
      .get<T>(table, filter["id"] || "", { filter, load, visibility: visibility as any })
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
