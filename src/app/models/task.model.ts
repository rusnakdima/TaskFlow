import { BaseEntity } from "@models/base-entity.model";
import { Subtask } from "@models/subtask.model";
import { Todo } from "@models/todo.model";
import { Comment } from "@models/comment.model";

export enum PriorityTask {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
}

export interface PriorityOption {
  value: string;
  label: string;
  description: string;
  colorClass: string;
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

export interface Task extends BaseEntity {
  id: string;
  todo_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: string;
  start_date: string | null;
  end_date: string | null;
  repeat?: RepeatInterval;
  order: number;
  depends_on?: string[];
  subtasks_count: number;
  completed_subtasks_count: number;
  comments_count: number;
}
