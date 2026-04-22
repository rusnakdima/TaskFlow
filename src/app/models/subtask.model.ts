import { PriorityTask, Task, TaskStatus } from "@models/task.model";
import { Comment } from "@models/comment.model";

export interface Subtask {
  id: string;
  task: Task;
  task_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: string;
  start_date: string | null;
  end_date: string | null;
  order: number;
  comments: Array<Comment>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}