import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";

/* models */
import { SyncMetadata } from "@models/sync-metadata";

/* services */
import { ApiProvider } from "@providers/api.provider";

/**
 * Relation loading statistics
 */
export interface RelationLoadingStats {
  totalQueries: number;
  loadTimeMs: number;
}

/**
 * RelationLoadingService - Optimized relation loading with statistics
 *
 * Features:
 * - Statistics tracking for performance monitoring
 * - Batch loading optimization
 *
 * Usage:
 * ```typescript
 * // Load with custom relations
 * const todo$ = this.relationLoader.load(
 *   this.dataSyncProvider,
 *   "todos",
 *   todoId,
 *   ["tasks", "tasks.subtasks", "user"]
 * );
 *
 * // Get statistics
 * const stats = this.relationLoader.getStats();
 * ```
 */
@Injectable({
  providedIn: "root",
})
export class RelationLoadingService {
  /** Statistics tracking */
  private stats: RelationLoadingStats = {
    totalQueries: 0,
    loadTimeMs: 0,
  };

  constructor() {}

  /**
   * Load entity with specified relations
   *
   * @param provider - ApiProvider instance
   * @param table - Table name
   * @param id - Entity ID
   * @param load - Array of relation paths (dot notation)
   * @returns Observable with the entity and loaded relations
   *
   * @example
   * ```typescript
   * const todo$ = this.relationLoader.load(
   *   this.dataSyncProvider,
   *   "todos",
   *   todoId,
   *   ["tasks", "tasks.subtasks", "user"]
   * );
   * ```
   */
  load<T>(
    provider: ApiProvider,
    table: string,
    id: string,
    load: string[],
    syncMetadata?: SyncMetadata
  ): Observable<T> {
    const startTime = Date.now();

    const isOwner = syncMetadata?.is_owner ?? false;
    const isPrivate = syncMetadata?.is_private ?? false;
    const visibility = syncMetadata?.visibility;

    return provider
      .crud<T>("get", table, {
        id,
        load,
        isOwner,
        isPrivate,
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

  /**
   * Load multiple entities with batch-optimized relations
   *
   * @param provider - ApiProvider instance
   * @param table - Table name
   * @param filter - Filter object
   * @param load - Array of relation paths
   * @returns Observable with array of entities
   *
   * @example
   * ```typescript
   * const todos$ = this.relationLoader.loadMany(
   *   this.dataSyncProvider,
   *   "todos",
   *   { userId: currentUserId },
   *   ["tasks", "tasks.subtasks"]
   * );
   * ```
   */
  loadMany<T>(
    provider: ApiProvider,
    table: string,
    filter: { [key: string]: any },
    load: string[],
    syncMetadata?: SyncMetadata
  ): Observable<T[]> {
    const startTime = Date.now();

    const isOwner = syncMetadata?.is_owner ?? false;
    const isPrivate = syncMetadata?.is_private ?? false;
    const visibility = syncMetadata?.visibility;

    return provider
      .crud<T[]>("getAll", table, {
        filter,
        load,
        isOwner,
        isPrivate,
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

  /**
   * Load single entity with relations
   *
   * @param provider - ApiProvider instance
   * @param table - Table name
   * @param filter - Filter object (should return single record)
   * @param load - Array of relation paths
   * @returns Observable with single entity
   */
  loadOne<T>(
    provider: ApiProvider,
    table: string,
    filter: { [key: string]: any },
    load: string[],
    syncMetadata?: SyncMetadata
  ): Observable<T | null> {
    const startTime = Date.now();

    const isOwner = syncMetadata?.is_owner ?? false;
    const isPrivate = syncMetadata?.is_private ?? false;
    const visibility = syncMetadata?.visibility;

    return provider
      .crud<T>("get", table, {
        filter,
        load,
        isOwner,
        isPrivate,
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

  /**
   * Get current loading statistics
   */
  getStats(): RelationLoadingStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalQueries: 0,
      loadTimeMs: 0,
    };
  }
}
