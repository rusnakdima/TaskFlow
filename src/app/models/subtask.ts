/* models */
import { PriorityTask, Task } from "./task";

export interface Subtask {
  id: string;
  task: Task;
  title: string;
  description: string;
  isCompleted: boolean;
  priority: PriorityTask;
  createdAt: string;
  updatedAt: string;
}
