import { Injectable } from "@angular/core";

export type StorageValidator<T> = (value: unknown) => value is T;

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
  get<T>(key: string, defaultValue: T, validator?: StorageValidator<T>): T {
    const storedValue = localStorage.getItem(key);

    if (!storedValue) {
      return defaultValue;
    }

    try {
      const parsed = JSON.parse(storedValue);

      if (validator && validator(parsed)) {
        return parsed;
      }

      if (!validator) {
        return parsed as T;
      }

      return defaultValue;
    } catch {
      return defaultValue;
    }
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
