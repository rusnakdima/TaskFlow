import { BaseEntity } from "@models/base-entity.model";

export interface Chat extends BaseEntity {
  id: string;
  todo_id: string;
  user_id: string;
  author_name?: string;
  content: string;
  read_by: string[];
  user?: {
    username?: string;
    email?: string;
  };
  todo?: any;
  read_by_users?: any[];
}

export interface ChatCreate {
  todo_id: string;
  user_id: string;
  content: string;
}
