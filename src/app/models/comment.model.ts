export interface Comment {
  id: string;
  user_id: string;
  content: string;
  task_id?: string;
  subtask_id?: string;
  read_by: string[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
