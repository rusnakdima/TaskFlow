import { Comment } from "@models/generated/api.types";

export interface SubtaskCommentGroup {
  subtask_id: string;
  title: string;
  comments: Comment[];
}

export interface CommentPayload {
  user_id: string;
  task_id?: string;
  subtask_id?: string;
  content: string;
  read_by?: string[];
  deleted_at?: string;
}

export interface MarkCommentsResult {
  updatedComments: string[];
  hasChanges: boolean;
}
