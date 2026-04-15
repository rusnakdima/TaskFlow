export interface Comment {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  created_at: string;
  updated_at: string;
  taskId?: string;
  subtaskId?: string;
  readBy: string[];
  deleted_at: string | null;
}
