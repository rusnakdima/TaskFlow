export interface Comment {
  _id?: any;
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  taskId?: string;
  subtaskId?: string;
  readBy: string[];
  isDeleted?: boolean;
}
