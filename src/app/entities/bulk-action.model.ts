export type BulkActionMode = "admin" | "archive" | "todos" | "tasks" | "subtasks" | "shared";
export interface BulkActionState {
  selectedIds: Set<string>;
  isAllSelected: boolean;
  totalCount: number;
  mode: BulkActionMode;
  show: boolean;
}
