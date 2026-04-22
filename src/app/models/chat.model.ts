export interface Chat {
  id: string;
  todoId: string;
  userId: string;
  authorName: string;
  content: string;
  readBy: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ChatCreate {
  todoId: string;
  userId: string;
  authorName: string;
  content: string;
}