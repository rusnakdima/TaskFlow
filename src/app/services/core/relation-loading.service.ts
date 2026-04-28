import { Injectable } from "@angular/core";
import { Observable, of, firstValueFrom } from "rxjs";
import { catchError, tap } from "rxjs/operators";

/* models */
import { SyncMetadata } from "@models/sync-metadata";

/* services */
import { ApiProvider } from "@providers/api.provider";

export type ViewContext = "list" | "detail" | "kanban" | "calendar" | "minimal";

const VIEW_RELATIONS: Record<string, Record<ViewContext, string[]>> = {
  todos: {
    list: ["user", "categories"],
    detail: [
      "user",
      "categories",
      "tasks",
      "tasks.subtasks",
      "tasks.subtasks.comments",
      "tasks.comments",
      "assignees",
    ],
    kanban: ["tasks", "tasks.subtasks"],
    calendar: ["user", "categories"],
    minimal: ["user", "categories"],
  },
  tasks: {
    list: ["subtasks"],
    detail: ["todo", "subtasks", "subtasks.comments", "comments"],
    kanban: ["subtasks"],
    calendar: ["todo"],
    minimal: ["subtasks"],
  },
  subtasks: {
    list: ["task"],
    detail: ["task", "comments"],
    kanban: ["task"],
    calendar: ["task"],
    minimal: ["task"],
  },
};

function getRelationsForView(table: string, context: ViewContext = "list"): string[] {
  return VIEW_RELATIONS[table]?.[context] ?? [];
}

/**
 * Relation loading statistics
 */
export interface RelationLoadingStats {
  totalQueries: number;
  cacheHits: number;
  loadTimeMs: number;
}

/**
 * RelationLoadingService - Optimized relation loading with caching and statistics
 *
 * Features:
 * - Client-side caching to reduce redundant requests
 * - View-specific relation loading (list, detail, kanban, etc.)
 * - Statistics tracking for performance monitoring
 * - Batch loading optimization
 *
 * Usage:
 * ```typescript
 * // In a component or service
 * constructor(private relationLoader: RelationLoadingService) {}
 *
 * // Load todo with optimized relations for list view
 * const todo$ = this.relationLoader.loadWithViewContext(
 *   this.dataSyncProvider,
 *   "todos",
 *   todoId,
 *   "list"
 * );
 *
 * // Load with custom relations
 * const todo$ = this.relationLoader.load(
 *   this.dataSyncProvider,
 *   "todos",
 *   todoId,
 *   ["tasks", "tasks.subtasks", "user"]
 * );
 *
 * // Load with caching
 * const todo$ = this.relationLoader.loadWithCache(
 *   this.dataSyncProvider,
 *   "todos",
 *   todoId,
 *   ["tasks"]
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
  /** Client-side cache for relation data */
  private relationCache = new Map<string, { data: any; timestamp: number }>();

  /** Cache TTL in milliseconds (5 seconds) */
  private readonly CACHE_TTL_MS = 5000;

  /** Statistics tracking */
  private stats: RelationLoadingStats = {
    totalQueries: 0,
    cacheHits: 0,
    loadTimeMs: 0,
  };

  constructor() {}

  /**
   * Load entity with relations optimized for a specific view context
   *
   * @param provider - ApiProvider instance
   * @param table - Table name (e.g., "todos", "tasks")
   * @param id - Entity ID
   * @param context - View context ("list", "detail", "kanban", etc.)
   * @returns Observable with the entity and loaded relations
   *
   * @example
   * ```typescript
   * const todo$ = this.relationLoader.loadWithViewContext(
   *   this.dataSyncProvider,
   *   "todos",
   *   todoId,
   *   "detail"
   * );
   * ```
   */
  loadWithViewContext<T>(
    provider: ApiProvider,
    table: string,
    id: string,
    context: ViewContext = "list"
  ): Observable<T> {
    const load = getRelationsForView(table, context);
    return this.load(provider, table, id, load);
  }

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

    // Use caller-provided sync_metadata if available, otherwise default to MongoDB
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
        }),
        catchError((error) => {
          throw error;
        })
      );
  }

  /**
   * Load entity with relations and client-side caching
   *
   * @param provider - ApiProvider instance
   * @param table - Table name
   * @param id - Entity ID
   * @param load - Array of relation paths
   * @returns Observable with the cached or fetched entity
   */
  async loadWithCache<T>(
    provider: ApiProvider,
    table: string,
    id: string,
    load: string[]
  ): Promise<T> {
    const cacheKey = this.buildCacheKey(table, id, load);

    // Check cache first
    const cached = this.getCached<T>(cacheKey);
    if (cached) {
      this.stats.cacheHits++;
      return cached;
    }

    // Fetch from server
    const startTime = Date.now();
    try {
      const result = await firstValueFrom(provider.crud<T>("get", table, { id, load }));

      // Cache the result
      this.setCached(cacheKey, result);

      // Update stats
      this.stats.totalQueries++;
      this.stats.loadTimeMs += Date.now() - startTime;

      return result as T;
    } catch (error) {
      throw error;
    }
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

    // Use caller-provided sync_metadata if available, otherwise default to MongoDB
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
        }),
        catchError((error) => {
          throw error;
        })
      );
  }

  /**
   * Load multiple entities with view-optimized relations
   *
   * @param provider - ApiProvider instance
   * @param table - Table name
   * @param filter - Filter object
   * @param context - View context
   * @returns Observable with array of entities
   */
  loadManyWithViewContext<T>(
    provider: ApiProvider,
    table: string,
    filter: { [key: string]: any },
    context: ViewContext = "list"
  ): Observable<T[]> {
    const load = getRelationsForView(table, context);
    return this.loadMany(provider, table, filter, load);
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
      cacheHits: 0,
      loadTimeMs: 0,
    };
  }

  /**
   * Clear the client-side cache
   */
  clearCache(table?: string): void {
    if (table) {
      // Clear cache for specific table only
      for (const key of this.relationCache.keys()) {
        if (key.startsWith(`${table}:`)) {
          this.relationCache.delete(key);
        }
      }
    } else {
      // Clear all cache
      this.relationCache.clear();
    }
  }

  /**
   * Invalidate cache for a specific entity
   */
  invalidateCache(table: string, id: string): void {
    const prefix = `${table}:${id}:`;
    for (const key of this.relationCache.keys()) {
      if (key.startsWith(prefix)) {
        this.relationCache.delete(key);
      }
    }
  }

  /**
   * Build cache key from table, ID, and relations
   */
  private buildCacheKey(table: string, id: string, load: string[]): string {
    return `${table}:${id}:${load.sort().join(",")}`;
  }

  /**
   * Get cached data if valid
   */
  private getCached<T>(cacheKey: string): T | null {
    const cached = this.relationCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data as T;
    }
    // Remove expired cache entry
    if (cached) {
      this.relationCache.delete(cacheKey);
    }
    return null;
  }

  /**
   * Set cached data
   */
  private setCached(cacheKey: string, data: any): void {
    this.relationCache.set(cacheKey, {
      data,
      timestamp: Date.now(),
    });
  }
}
