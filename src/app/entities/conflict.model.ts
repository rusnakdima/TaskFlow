import { Todo, Task, Subtask } from "./generated/api.types";
export interface Conflict {
  id: string;
  entityType: "todo" | "task" | "subtask" | "category";
  entityId: string;
  localVersion: number;
  remoteVersion: number;
  localData: Todo | Task | Subtask | any;
  remoteData: Todo | Task | Subtask | any;
  timestamp: string;
  resolved: boolean;
}
export type ConflictResolution = "local" | "remote" | "merge" | "skip";
export interface ConflictDetectionStats {
  totalConflicts: number;
  resolved: number;
  pending: number;
}
