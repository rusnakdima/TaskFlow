import { Todo, Task, Subtask, Comment, Chat } from "./generated/api.types";
import { Category } from "./category.model";

export interface ArchiveDataMap {
  [key: string]: any[];
}

export interface DailyActivity {
  id: string;
  user_id: string;
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
