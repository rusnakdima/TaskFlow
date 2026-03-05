/* models */
import { Subtask } from "./subtask.model";
import { Todo } from "./todo.model";

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
  _id?: {} | undefined;
  id: string;
  todo: Todo;
  todoId: string;
  title: string;
  description: string;
  subtasks: Array<Subtask>;
  status: TaskStatus;
  priority: PriorityTask;
  startDate: string;
  endDate: string;
  repeat?: RepeatInterval;
  order: number;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  assignees?: string[];
  dependsOn?: string[];
}
