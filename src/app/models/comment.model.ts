import { BaseEntity } from "@models/base-entity.model";
import { User } from "./user.model";

export interface Comment extends BaseEntity {
  id: string;
  user_id: string;
  content: string;
  task_id?: string;
  subtask_id?: string;
  read_by?: string[];
  github_comment_id?: string;
  github_issue_id?: string;
  user?: User;
}

export interface CommentPayload {
  taskId?: string;
  task_id?: string;
  subtaskId?: string;
  subtask_id?: string;
  content: string;
  visibility?: string;
  user_id?: string;
  read_by?: string[];
  deleted_at?: string | null;
}

export interface MarkCommentsResult {
  count?: number;
  updated?: string[];
  updatedComments?: string[];
  hasChanges?: boolean;
}

export interface SubtaskCommentGroup {
  subtask_id: string;
  title?: string;
  comments: Comment[];
}
