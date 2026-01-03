/* models */
import { PriorityTask, Task, TaskStatus } from "./task.model";

export interface Subtask {
  _id?: {} | undefined;
  id: string;
  task: Task;
  taskId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: PriorityTask;
  order: number;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}
