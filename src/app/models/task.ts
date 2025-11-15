/* models */
import { Subtask } from "./subtask";
import { Todo } from "./todo";

export enum PriorityTask {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
}

export interface Task {
  _id?: {} | undefined;
  id: string;
  todo: Todo;
  todoId: string;
  title: string;
  description: string;
  subtasks: Array<Subtask>;
  isCompleted: boolean;
  priority: PriorityTask;
  startDate: string;
  endDate: string;
  order: number;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}
