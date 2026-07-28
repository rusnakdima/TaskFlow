export class StorageCacheService {
  cacheInvalidated = { set: () => {}, value: false };
  hasReactiveCache = () => false;
  getReactiveCache = () => null;
  setReactiveCache = () => {};
  hasTasksCache = () => false;
  getTasksCache = () => null;
  setTasksCache = () => {};
  setChatCache = () => {};
  setCacheTimestamp = () => {};
  isCacheValid = () => false;
  isCacheFull = () => false;
  evictOldestCache = () => {};
  invalidateCache = () => {};
  clearAll = () => {};
}
