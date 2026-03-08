/* models */
import { PriorityTask, Task, TaskStatus } from "@models/task.model";
import { Comment } from "@models/comment.model";

export interface Subtask {
  _id?: {} | undefined;
  id: string;
  task: Task;
  taskId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: PriorityTask;
  startDate?: string;
  endDate?: string;
  order: number;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  comments: Array<Comment>;
}
