const CACHE_TTL_MS = 5000;

export interface CacheEntry {
  data: any;
  timestamp: number;
}

export class CacheHelper {
  private cache = new Map<string, CacheEntry>();

  isCacheable(operation: string): boolean {
    return operation === "getAll" || operation === "get";
  }

  getCached(requestKey: string): any | null {
    const cached = this.cache.get(requestKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
    if (cached) {
      this.cache.delete(requestKey);
    }
    return null;
  }

  cacheRequest(requestKey: string, data: any): void {
    this.cache.set(requestKey, { data, timestamp: Date.now() });
  }

  clearCache(table?: string): void {
    if (table) {
      for (const key of this.cache.keys()) {
        if (key.includes(`:${table}:`)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  getCacheSize(): number {
    return this.cache.size;
  }
}
