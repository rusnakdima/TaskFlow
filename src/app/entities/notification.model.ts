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
  label?: string;
  icon?: string;
  callback?: () => void;
}
export interface NotificationSettings {
  duration?: number;
  position?: "top" | "bottom" | "center";
  maxVisible?: number;
  enableSounds?: boolean;
  chatVolume?: number;
  commentVolume?: number;
  generalVolume?: number;
}
