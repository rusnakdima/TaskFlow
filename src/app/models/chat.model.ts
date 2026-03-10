export interface Chat {
  id: string;
  todoId: string;
  userId: string;
  authorName: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  readBy: string[];
}

export interface ChatCreate {
  todoId: string;
  userId: string;
  authorName: string;
  content: string;
}
