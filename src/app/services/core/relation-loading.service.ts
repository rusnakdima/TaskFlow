import { Injectable, inject } from "@angular/core";
import { Observable, of } from "rxjs";
import { tap, catchError } from "rxjs/operators";

/* services */
import { DataService } from "@services/data/data.service";

export interface RelationLoadingStats {
  totalQueries: number;
  loadTimeMs: number;
}

@Injectable({
  providedIn: "root",
})
export class RelationLoadingService {
  private dataService = inject(DataService);

  private stats: RelationLoadingStats = {
    totalQueries: 0,
    loadTimeMs: 0,
  };

  constructor() {}

  load<T>(table: string, id: string, load: string[], visibility?: string): Observable<T> {
    const startTime = Date.now();

    return this.dataService.get<T>(table, id, { load, visibility }).pipe(
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

    return this.dataService.getAll<T>(table, { filter, load, visibility }).pipe(
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

    return this.dataService.get<T>(table, filter["id"] || "", { filter, load, visibility }).pipe(
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
