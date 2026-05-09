import { Signal, WritableSignal } from "@angular/core";
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Comment } from "@models/comment.model";
import { Chat } from "@models/chat.model";
import { Category } from "@models/category.model";
import { Profile } from "@models/profile.model";
import { User } from "@models/user.model";

export interface StorageSignalMap {
  [key: string]: WritableSignal<any[]>;
  todos: WritableSignal<Todo[]>;
  tasks: WritableSignal<Task[]>;
  subtasks: WritableSignal<Subtask[]>;
  comments: WritableSignal<Comment[]>;
  chats: WritableSignal<Chat[]>;
  categories: WritableSignal<Category[]>;
  daily_activities: WritableSignal<any[]>;
}

export interface PaginationState {
  skip: number;
  limit: number;
  hasMore: boolean;
}

export type VisibilityFilter = "all" | "private" | "shared" | "public";
export type StorageEntity =
  | "todos"
  | "tasks"
  | "subtasks"
  | "categories"
  | "profiles"
  | "chats"
  | "comments"
  | "users";

export { Todo, Task, Subtask, Comment, Chat, Category, Profile, User };
