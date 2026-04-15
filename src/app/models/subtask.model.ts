import { PriorityTask, Task, TaskStatus } from "@models/task.model";
import { Comment } from "@models/comment.model";

export interface Subtask {
  id: string;
  task: Task;
  taskId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: PriorityTask;
  startDate: string | null;
  endDate: string | null;
  order: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  comments: Array<Comment>;
}
