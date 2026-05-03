import { BaseEntity } from "@models/base-entity.model";

export interface Comment extends BaseEntity {
  id: string;
  user_id: string;
  content: string;
  task_id?: string;
  subtask_id?: string;
  read_by: string[];
}
