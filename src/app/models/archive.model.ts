import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Comment } from "@models/comment.model";
import { Chat } from "@models/chat.model";
import { Category } from "@models/category.model";

export interface ArchiveDataMap {
  [key: string]: any[];
}

export interface DailyActivity {
  id: string;
  userId: string;
  date: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export type ArchiveRecord = Todo | Task | Subtask | Comment | Chat | Category | DailyActivity;

export interface ArchiveDataTypes {
  id: string;
  label: string;
  icon: string;
  count: number;
}
