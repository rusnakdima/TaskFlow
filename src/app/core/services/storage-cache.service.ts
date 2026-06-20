/* sys lib */
import { Injectable, signal, computed } from "@angular/core";
/* utils */
import { DEFAULT_CACHE_TTL_MS } from "@helpers/index";
const MAX_CACHE_SIZE = 100;
@Injectable({ providedIn: "root" })
export class StorageCacheService {
  private readonly _reactiveCache = new Map<string, ReturnType<typeof computed<any>>>();
  private readonly _chatCache = new Map<string, ReturnType<typeof computed<any>>>();
  private readonly _tasksCache = new Map<string, ReturnType<typeof computed<any>>>();
  private readonly _cacheTimestamps = new Map<string, number>();
  readonly cacheInvalidated = signal(false);
  get reactiveCache(): Map<string, ReturnType<typeof computed<any>>> {
    return this._reactiveCache;
  }
  get chatCache(): Map<string, ReturnType<typeof computed<any>>> {
    return this._chatCache;
  }
  get tasksCache(): Map<string, ReturnType<typeof computed<any>>> {
    return this._tasksCache;
  }
  hasReactiveCache(key: string): boolean {
    return this._reactiveCache.has(key);
  }
  getReactiveCache(key: string): ReturnType<typeof computed<any>> | undefined {
    return this._reactiveCache.get(key);
  }
  setReactiveCache(key: string, value: ReturnType<typeof computed<any>>): void {
    this._reactiveCache.set(key, value);
  }
  hasChatCache(key: string): boolean {
    return this._chatCache.has(key);
  }
  getChatCache(key: string): ReturnType<typeof computed<any>> | undefined {
    return this._chatCache.get(key);
  }
  setChatCache(key: string, value: ReturnType<typeof computed<any>>): void {
    this._chatCache.set(key, value);
  }
  hasTasksCache(key: string): boolean {
    return this._tasksCache.has(key);
  }
  getTasksCache(key: string): ReturnType<typeof computed<any>> | undefined {
    return this._tasksCache.get(key);
  }
  setTasksCache(key: string, value: ReturnType<typeof computed<any>>): void {
    this._tasksCache.set(key, value);
  }
  getCacheTimestamp(key: string): number | undefined {
    return this._cacheTimestamps.get(key);
  }
  setCacheTimestamp(key: string, timestamp: number): void {
    this._cacheTimestamps.set(key, timestamp);
  }
  isCacheValid(key: string, ttlMs: number = DEFAULT_CACHE_TTL_MS): boolean {
    const timestamp = this._cacheTimestamps.get(key);
    if (!timestamp) return false;
    return Date.now() - timestamp < ttlMs;
  }
  isCacheFull(): boolean {
    return this._chatCache.size >= MAX_CACHE_SIZE || this._tasksCache.size >= MAX_CACHE_SIZE;
  }
  evictOldestCache(): void {
    const sortedKeys = Array.from(this._cacheTimestamps.entries())
      .sort((a, b) => a[1] - b[1])
      .slice(0, 10)
      .map(([key]) => key);
    for (const key of sortedKeys) {
      const id = key.replace(/^(tasks|chats)_by_todo_/, "");
      this._chatCache.delete(id);
      this._tasksCache.delete(id);
      this._cacheTimestamps.delete(key);
    }
  }
  invalidateCache(): void {
    this._chatCache.clear();
    this._tasksCache.clear();
    this._cacheTimestamps.clear();
    this._reactiveCache.clear();
    this.cacheInvalidated.set(true);
    setTimeout(() => this.cacheInvalidated.set(false), 0);
  }
  clearAll(): void {
    this._chatCache.clear();
    this._tasksCache.clear();
    this._cacheTimestamps.clear();
    this._reactiveCache.clear();
    this.cacheInvalidated.set(true);
    setTimeout(() => this.cacheInvalidated.set(false), 0);
  }
}
