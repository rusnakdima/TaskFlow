import { Injectable } from "@angular/core";

export const STORAGE_KEYS = {
  SETTINGS: "taskflow-settings",
  PROJECT_ORDER: "taskflow-project-order",
  TASK_ORDER: (projectId: string) => `taskflow-task-order-${projectId}`,
  COLUMN_ORDER: (projectId: string) => `taskflow-column-order-${projectId}`,
  FILTER_HISTORY: "taskflow-filter-history",
  EXPLORER_SPLIT_MODE: "taskflow-explorer-split-mode",
} as const;

@Injectable({ providedIn: "root" })
export class LocalStorageService {
  get<T>(key: string): T | null {
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    try {
      return JSON.parse(stored) as T;
    } catch {
      return null;
    }
  }

  getOrSet<T>(key: string, defaultValue: T): T {
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        return JSON.parse(stored) as T;
      } catch {
        return defaultValue;
      }
    }
    const value = defaultValue;
    localStorage.setItem(key, JSON.stringify(value));
    return value;
  }

  set<T>(key: string, value: T): void {
    localStorage.setItem(key, JSON.stringify(value));
  }

  remove(key: string): void {
    localStorage.removeItem(key);
  }

  has(key: string): boolean {
    return localStorage.getItem(key) !== null;
  }
}
