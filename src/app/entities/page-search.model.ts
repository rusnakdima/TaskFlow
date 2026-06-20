export const DEFAULT_EXCLUDE_FIELDS = [
  "id",
  "created_at",
  "updated_at",
  "deleted_at",
  "createdBy",
  "updatedBy",
  "userId",
  "todo_id",
  "task_id",
  "subtask_id",
];
export interface PageSearchConfig {
  includeFields: string[];
  excludeFields?: string[];
  placeholder?: string;
}
