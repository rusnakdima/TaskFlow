/* angular */
import { Injectable, computed } from "@angular/core";
/* library */
import { StorageCacheService as LibStorageCacheService } from "@tauri-front/shared";

/**
 * TaskFlow-specific cache service extending the shared library's StorageCacheService.
 * Adds domain-specific cache accessors (chat, tasks) while reusing the library's
 * TTL cache, reactive cache, timestamp tracking, and eviction logic.
 */
@Injectable({ providedIn: "root" })
export class StorageCacheService extends LibStorageCacheService {
  // Domain-specific cache accessors (convenience wrappers around library methods)

  hasReactiveCache(key: string): boolean {
    return this.hasCachedData(key);
  }

  override getReactiveCache(key: string): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (super.getReactiveCache as any)(key);
  }

  override setReactiveCache(key: string, value: any): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (super.setReactiveCache as any)(key, value);
  }

  hasChatCache(key: string): boolean {
    return this.hasCachedData(`chat:${key}`);
  }

  getChatCache(key: string): ReturnType<typeof computed<any>> | undefined {
    return this.getReactiveCache(`chat:${key}`) as ReturnType<typeof computed<any>> | undefined;
  }

  setChatCache(key: string, value: any): void {
    this.setReactiveCache(`chat:${key}`, value);
  }

  hasTasksCache(key: string): boolean {
    return this.hasCachedData(`tasks:${key}`);
  }

  getTasksCache(key: string): ReturnType<typeof computed<any>> | undefined {
    return this.getReactiveCache(`tasks:${key}`) as ReturnType<typeof computed<any>> | undefined;
  }

  setTasksCache(key: string, value: any): void {
    this.setReactiveCache(`tasks:${key}`, value);
  }

  // Invalidate all domain-specific caches

  override invalidateCache(): void {
    this.invalidateAll();
    this.cacheInvalidated.set(true);
    setTimeout(() => this.cacheInvalidated.set(false), 0);
  }

  override clearAll(): void {
    this.invalidateAll();
    this.cacheInvalidated.set(true);
    setTimeout(() => this.cacheInvalidated.set(false), 0);
  }
}
