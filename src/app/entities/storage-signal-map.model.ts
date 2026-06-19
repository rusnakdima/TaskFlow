import { WritableSignal } from "@angular/core";

export interface StorageSignalMap {
  [key: string]: WritableSignal<any[]>;
  todos: WritableSignal<any[]>;
  tasks: WritableSignal<any[]>;
  subtasks: WritableSignal<any[]>;
  comments: WritableSignal<any[]>;
  chats: WritableSignal<any[]>;
  categories: WritableSignal<any[]>;
  daily_activities: WritableSignal<any[]>;
}
