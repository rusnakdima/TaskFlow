import { Todo, Task, Subtask } from "./generated/api.types";

export interface Conflict {
  id: string;
  entityType: "todo" | "task" | "subtask";
  entityId: string;
  localVersion: Todo | Task | Subtask;
  remoteVersion: Todo | Task | Subtask;
  timestamp: number;
}

export type ConflictResolution = "keep_local" | "keep_remote" | "merge" | "skip";

export interface ConflictDetectionStats {
  totalConflicts: number;
  resolved: number;
  pending: number;
}
