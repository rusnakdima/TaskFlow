export interface CascadeResult {
  success?: boolean;
  deletedCount?: number;
  error?: string;
  taskIds?: string[];
  subtaskIds?: string[];
  timestamp?: string;
}

export interface CascadeUpdate {
  id?: string;
  updates?: Record<string, any>;
  todoId?: string;
  taskId?: string;
  subtaskId?: string;
  cascade?: boolean;
}

export {};
