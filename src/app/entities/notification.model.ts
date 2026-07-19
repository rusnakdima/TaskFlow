export interface NotificationAction {
  id?: string;
  type?: "todo" | "task" | "subtask" | "comment" | "chat";
  action?: "created" | "updated" | "deleted" | "cleared";
  title?: string;
  message?: string;
  timestamp?: Date;
  read?: boolean;
  todo_id?: string;
  task_id?: string;
  subtask_id?: string;
  comment_id?: string;
  chat_id?: string;
}
export interface NotificationSettings {
  enableSounds?: boolean;
  chatVolume?: number;
  commentVolume?: number;
  generalVolume?: number;
}
