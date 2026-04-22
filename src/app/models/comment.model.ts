export interface Comment {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  taskId?: string;
  subtaskId?: string;
  readBy: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}