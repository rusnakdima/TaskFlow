// Re-export LocalStorageService from @tauri-front/shared
export { LocalStorageService, type StorageValidator } from "@tauri-front/shared";

export const STORAGE_KEYS = {
  SETTINGS: "taskflow-settings",
  PROJECT_ORDER: "taskflow-project-order",
  TASK_ORDER: (projectId: string) => `taskflow-task-order-${projectId}`,
  COLUMN_ORDER: (projectId: string) => `taskflow-column-order-${projectId}`,
  FILTER_HISTORY: "taskflow-filter-history",
  EXPLORER_SPLIT_MODE: "taskflow-explorer-split-mode",
} as const;
