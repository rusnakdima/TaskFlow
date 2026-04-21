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
  todo: Todo;
  todoId: string;
  title: string;
  description: string;
  subtasks: Array<Subtask>;
  status: TaskStatus;
  priority: string;
  startDate: string | null;
  endDate: string | null;
  repeat?: RepeatInterval;
  order: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignees: string[];
  dependsOn: string[];
  comments: Array<Comment>;
}

export interface PriorityOption {
  value: PriorityTask;
  label: string;
  description?: string;
  colorClass: string;
}
