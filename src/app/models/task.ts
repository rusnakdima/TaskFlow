/* models */
import { Todo } from "./todo";

export enum PriorityTask {
  Low,
  Medium,
  High,
}

export interface Task {
  id: string;
  todo: Todo;
  title: string;
  description: string;
  isCompleted: boolean;
  priority: PriorityTask;
  createdAt: string;
  updatedAt: string;
}
