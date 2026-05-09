import { ResponseStatus } from "./response.model";

export interface AdminDataWithRelations {
  data?: any;
  relations?: Record<string, any[]>;
  status?: ResponseStatus;
  todos?: any[];
  tasks?: any[];
  subtasks?: any[];
  comments?: any[];
  chats?: any[];
  categories?: any[];
  users?: any[];
  profiles?: any[];
  daily_activities?: any[];
  [key: string]: any;
}

export interface LoadDataOptions {
  visibility?: string;
  filter?: Record<string, any>;
  skip?: number;
  limit?: number;
  load?: string[];
  showDeleted?: boolean;
  taskIds?: string[];
}
