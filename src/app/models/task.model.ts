import { Subtask } from "@models/subtask.model";
import { Todo } from "@models/todo.model";
import { Comment } from "@models/comment.model";

export enum PriorityTask {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
}

export enum TaskStatus {
  PENDING = "pending",
  COMPLETED = "completed",
  SKIPPED = "skipped",
  FAILED = "failed",
}

export enum RepeatInterval {
  NONE = "none",
  DAILY = "daily",
  WEEKLY = "weekly",
  MONTHLY = "monthly",
}

export interface Task {
  id: string;
  todo_id: string;
  title: string;
  description: string;
  subtasks: Array<Subtask>;
  status: TaskStatus;
  priority: string;
  start_date: string | null;
  end_date: string | null;
  repeat?: RepeatInterval;
  order: number;
  depends_on?: string[];
  comments: Array<Comment>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  todo?: Todo;
}

export interface PriorityOption {
  value: PriorityTask;
  label: string;
  description?: string;
  colorClass: string;
}
