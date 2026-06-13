import { ResponseStatus } from "./response.model";
import { TableItem } from "@shared/models/api.types";

export interface AdminDataWithRelations {
  data?: TableItem;
  relations?: Record<string, TableItem[]>;
  status?: ResponseStatus;
  todos?: TableItem[];
  tasks?: TableItem[];
  subtasks?: TableItem[];
  comments?: TableItem[];
  chats?: TableItem[];
  categories?: TableItem[];
  users?: TableItem[];
  profiles?: TableItem[];
  daily_activities?: TableItem[];
  [key: string]: unknown;
}

export interface LoadDataOptions {
  visibility?: string;
  filter?: Record<string, unknown>;
  skip?: number;
  limit?: number;
  load?: string[];
  showDeleted?: boolean;
  taskIds?: string[];
}
