import { Injectable } from "@angular/core";

export interface RelationLoadingStats {
  totalQueries: number;
  cacheHits: number;
  loadTimeMs: number;
}

@Injectable({
  providedIn: "root",
})
export class RelationCacheService {
  private relationCache = new Map<string, { data: any; timestamp: number }>();

  private readonly CACHE_TTL_MS = 5000;

  private stats: RelationLoadingStats = {
    totalQueries: 0,
    cacheHits: 0,
    loadTimeMs: 0,
  };

  clearCache(table?: string): void {
    if (table) {
      for (const key of this.relationCache.keys()) {
        if (key.startsWith(`${table}:`)) {
          this.relationCache.delete(key);
        }
      }
    } else {
      this.relationCache.clear();
    }
  }

  invalidateCache(table: string, id: string): void {
    const prefix = `${table}:${id}:`;
    for (const key of this.relationCache.keys()) {
      if (key.startsWith(prefix)) {
        this.relationCache.delete(key);
      }
    }
  }

  buildCacheKey(table: string, id: string, load: string[]): string {
    return `${table}:${id}:${load.sort().join(",")}`;
  }

  getCached<T>(cacheKey: string): T | null {
    const cached = this.relationCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data as T;
    }
    if (cached) {
      this.relationCache.delete(cacheKey);
    }
    return null;
  }

  setCached(cacheKey: string, data: any): void {
    this.relationCache.set(cacheKey, {
      data,
      timestamp: Date.now(),
    });
  }

  getStats(): RelationLoadingStats {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = {
      totalQueries: 0,
      cacheHits: 0,
      loadTimeMs: 0,
    };
  }

  incrementTotalQueries(elapsed: number): void {
    this.stats.totalQueries++;
    this.stats.loadTimeMs += elapsed;
  }

  incrementCacheHits(): void {
    this.stats.cacheHits++;
  }
}
