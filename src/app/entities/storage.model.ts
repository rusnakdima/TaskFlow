import { Todo, Task, Subtask, Comment, Chat, User, Category, Profile } from "./generated/api.types";
export type EntityType =
  | "todos"
  | "tasks"
  | "subtasks"
  | "comments"
  | "chats"
  | "categories"
  | "profiles"
  | "users"
  | "dailyActivities"
  | "allProfiles"
  | "user"
  | "privateTodos"
  | "sharedTodos"
  | "publicTodos";
export type VisibilityFilter = "all" | "private" | "shared" | "public";
export type Operation = "getAll" | "get" | "create" | "update" | "updateAll" | "delete";
export type ChatOperation = "set" | "add" | "update" | "delete" | "clear";
export type ParentType = "tasks" | "subtasks" | "chats";
export type ChildType = "todos" | "tasks" | "subtasks" | "categories" | "comments" | "chats";
export interface EntityMap {
  todos: Todo;
  tasks: Task;
  subtasks: Subtask;
  comments: Comment;
  chats: Chat;
  categories: Category;
  profiles: Profile;
  users: User;
}
export interface PaginationState {
  skip: number;
  limit: number;
  hasMore: boolean;
}
export interface SignalBundle {
  todos: import("@angular/core").WritableSignal<Todo[]>;
  tasks: import("@angular/core").WritableSignal<Task[]>;
  subtasks: import("@angular/core").WritableSignal<Subtask[]>;
  comments: import("@angular/core").WritableSignal<Comment[]>;
  chats: import("@angular/core").WritableSignal<Chat[]>;
  categories: import("@angular/core").WritableSignal<Category[]>;
  profiles: import("@angular/core").WritableSignal<Profile | null>;
  users: import("@angular/core").WritableSignal<User[]>;
}
