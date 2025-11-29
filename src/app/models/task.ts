/* models */
import { Subtask } from "./subtask";
import { Todo } from "./todo";

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
  order: number;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}
