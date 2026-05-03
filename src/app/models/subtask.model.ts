import { BaseEntity } from "@models/base-entity.model";
import { Task, TaskStatus } from "@models/task.model";
import { Comment } from "@models/comment.model";

export interface Subtask extends BaseEntity {
  id: string;
  task_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: string;
  start_date: string | null;
  end_date: string | null;
  order: number;
  comments_count: number;
}
