export interface Comment {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  taskId?: string;
  subtaskId?: string;
  readBy: string[];
  deletedAt: string | null;
}
