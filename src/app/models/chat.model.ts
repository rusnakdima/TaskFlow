export interface Chat {
  id: string;
  todoId: string;
  userId: string;
  authorName: string;
  content: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  readBy: string[];
}

export interface ChatCreate {
  todoId: string;
  userId: string;
  authorName: string;
  content: string;
}
