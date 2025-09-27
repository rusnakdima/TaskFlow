/* models */
import { Subtask } from "./subtask";
import { Todo } from "./todo";

export enum PriorityTask {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
}

export interface Task {
  id: string;
  todo: Todo;
  title: string;
  description: string;
  subtasks: Array<Subtask>;
  isCompleted: boolean;
  priority: PriorityTask;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
  order: number;
}
