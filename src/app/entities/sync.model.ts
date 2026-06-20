export interface QueuedOperation {
  id: string;
  operation: "create" | "update" | "delete";
  table: string;
  data?: Record<string, unknown>;
  timestamp: number;
  retries: number;
  visibility?: string;
}
export interface SyncProgress {
  stage: "idle" | "queued" | "syncing" | "error" | "complete";
  processed: number;
  total: number;
  message: string;
  isSyncing?: boolean;
  currentStep?: string;
  progress?: number;
  error?: string;
}
