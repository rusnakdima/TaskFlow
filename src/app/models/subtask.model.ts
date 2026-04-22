import { PriorityTask, Task, TaskStatus } from "@models/task.model";
import { Comment } from "@models/comment.model";

export interface Subtask {
  id: string;
  task: Task;
  taskId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: string;
  startDate: string | null;
  endDate: string | null;
  order: number;
  comments: Array<Comment>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}