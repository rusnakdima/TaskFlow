export interface Comment {
  id: string;
  author_id: string;
  author_name: string;
  content: string;
  task_id?: string;
  subtask_id?: string;
  read_by: string[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}