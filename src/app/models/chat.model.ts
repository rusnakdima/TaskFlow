export interface Chat {
  id: string;
  todo_id: string;
  user_id: string;
  author_name: string;
  content: string;
  read_by: string[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ChatCreate {
  todo_id: string;
  user_id: string;
  author_name: string;
  content: string;
}