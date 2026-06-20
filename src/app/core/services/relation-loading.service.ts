import { Injectable, inject } from "@angular/core";
import { Observable, of } from "rxjs";
import { tap, catchError } from "rxjs/operators";
/* services */
import { ApiService, HasId } from "@services/api.service";
import { RelationLoadingStats } from "@entities/relation.model";
@Injectable({
  providedIn: "root",
})
export class RelationLoadingService {
  private requestService = inject(ApiService);
  private stats: RelationLoadingStats = {
    totalQueries: 0,
    loadTimeMs: 0,
  };
  constructor() {}
  load<T extends HasId>(
    table: string,
    id: string,
    load: string[],
    visibility?: string
  ): Observable<T> {
    const startTime = Date.now();
    return this.requestService.get<T>(table, id, { load, visibility: visibility as any }).pipe(
      tap(() => {
        const elapsed = Date.now() - startTime;
        this.stats.totalQueries = (this.stats.totalQueries ?? 0) + 1;
        this.stats.loadTimeMs = (this.stats.loadTimeMs ?? 0) + elapsed;
      })
    );
  }
  loadMany<T extends HasId>(
    table: string,
    filter: { [key: string]: any },
    load: string[],
    visibility?: string
  ): Observable<T[]> {
    const startTime = Date.now();
    return this.requestService
      .getAll<T>(table, { filter, load, visibility: visibility as any })
      .pipe(
        tap(() => {
          const elapsed = Date.now() - startTime;
          this.stats.totalQueries = (this.stats.totalQueries ?? 0) + 1;
          this.stats.loadTimeMs = (this.stats.loadTimeMs ?? 0) + elapsed;
        }),
        catchError(() => {
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
          this.stats.totalQueries = (this.stats.totalQueries ?? 0) + 1;
          this.stats.loadTimeMs = (this.stats.loadTimeMs ?? 0) + elapsed;
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
