import { Injectable } from "@angular/core";
import { Observable, from } from "rxjs";
import { invoke } from "@tauri-apps/api/core";

import {
  ApiResponse,
  Todo,
  TodoCreateRequest,
  TodoUpdateRequest,
  TodoListResponse,
  Task,
  TaskCreateRequest,
  TaskUpdateRequest,
  TaskListResponse,
  Subtask,
  SubtaskCreateRequest,
  SubtaskUpdateRequest,
  SubtaskListResponse,
  Category,
  CategoryCreateRequest,
  CategoryUpdateRequest,
  CategoryListResponse,
  Profile,
  ProfileCreateRequest,
  ProfileUpdateRequest,
  ProfileListResponse,
  Chat,
  ChatCreateRequest,
  ChatUpdateRequest,
  ChatListResponse,
  Comment,
  CommentCreateRequest,
  CommentListResponse,
  User,
  LoginRequest,
  RegisterRequest,
  UserListResponse,
  CascadeResult,
} from "@models/generated/api.types";

@Injectable({ providedIn: "root" })
export class TypedApiService {
  private invokeCommand<T>(command: string, args: Record<string, unknown>): Observable<T> {
    return from(
      invoke<ApiResponse<any>>(command, args).then((response) => {
        if (response.status === "Success") {
          return response.data as T;
        }
        throw new Error(response.message);
      })
    );
  }

  // ==================== TODO METHODS ====================

  getTodo(id: string, visibility?: string): Observable<Todo> {
    return this.invokeCommand<Todo>("get_todo", { id, visibility });
  }

  getTodos(options?: {
    page?: number;
    limit?: number;
    visibility?: string;
    filter?: unknown;
    sort?: unknown;
  }): Observable<TodoListResponse> {
    return this.invokeCommand<TodoListResponse>("get_todos", {
      page: options?.page,
      limit: options?.limit,
      visibility: options?.visibility,
      filter: options?.filter,
      sort: options?.sort,
    });
  }

  createTodo(data: TodoCreateRequest): Observable<Todo> {
    return this.invokeCommand<Todo>("create_todo", { data });
  }

  updateTodo(id: string, data: TodoUpdateRequest, visibility?: string): Observable<Todo> {
    return this.invokeCommand<Todo>("update_todo", { id, data, visibility });
  }

  deleteTodo(id: string, visibility?: string): Observable<void> {
    return this.invokeCommand<void>("delete_todo", { id, visibility });
  }

  // ==================== TASK METHODS ====================

  getTask(id: string, visibility?: string, load?: string): Observable<Task> {
    return this.invokeCommand<Task>("get_task", { id, visibility, load });
  }

  getTasks(options?: {
    page?: number;
    limit?: number;
    visibility?: string;
    filter?: unknown;
    sort?: unknown;
    load?: string;
  }): Observable<TaskListResponse> {
    return this.invokeCommand<TaskListResponse>("get_tasks", {
      page: options?.page,
      limit: options?.limit,
      visibility: options?.visibility,
      filter: options?.filter,
      sort: options?.sort,
      load: options?.load,
    });
  }

  createTask(data: TaskCreateRequest): Observable<Task> {
    return this.invokeCommand<Task>("create_task", { data });
  }

  updateTask(id: string, data: TaskUpdateRequest, visibility?: string): Observable<Task> {
    return this.invokeCommand<Task>("update_task", { id, data, visibility });
  }

  deleteTask(id: string, visibility?: string): Observable<void> {
    return this.invokeCommand<void>("delete_task", { id, visibility });
  }

  // ==================== SUBTASK METHODS ====================

  getSubtask(id: string, visibility?: string, load?: string): Observable<Subtask> {
    return this.invokeCommand<Subtask>("get_subtask", { id, visibility, load });
  }

  getSubtasks(options?: {
    page?: number;
    limit?: number;
    visibility?: string;
    filter?: unknown;
    sort?: unknown;
    load?: string;
  }): Observable<SubtaskListResponse> {
    return this.invokeCommand<SubtaskListResponse>("get_subtasks", {
      page: options?.page,
      limit: options?.limit,
      visibility: options?.visibility,
      filter: options?.filter,
      sort: options?.sort,
      load: options?.load,
    });
  }

  createSubtask(data: SubtaskCreateRequest): Observable<Subtask> {
    return this.invokeCommand<Subtask>("create_subtask", { data });
  }

  updateSubtask(id: string, data: SubtaskUpdateRequest, visibility?: string): Observable<Subtask> {
    return this.invokeCommand<Subtask>("update_subtask", { id, data, visibility });
  }

  deleteSubtask(id: string, visibility?: string): Observable<void> {
    return this.invokeCommand<void>("delete_subtask", { id, visibility });
  }

  // ==================== CATEGORY METHODS ====================

  getCategory(id: string, visibility?: string, load?: string): Observable<Category> {
    return this.invokeCommand<Category>("get_category", { id, visibility, load });
  }

  getCategories(options?: {
    page?: number;
    limit?: number;
    visibility?: string;
    filter?: unknown;
    load?: string;
  }): Observable<CategoryListResponse> {
    return this.invokeCommand<CategoryListResponse>("get_categories", {
      page: options?.page,
      limit: options?.limit,
      visibility: options?.visibility,
      filter: options?.filter,
      load: options?.load,
    });
  }

  createCategory(data: CategoryCreateRequest): Observable<Category> {
    return this.invokeCommand<Category>("create_category", { data });
  }

  updateCategory(id: string, data: CategoryUpdateRequest): Observable<Category> {
    return this.invokeCommand<Category>("update_category", { id, data });
  }

  deleteCategory(id: string, visibility?: string): Observable<void> {
    return this.invokeCommand<void>("delete_category", { id, visibility });
  }

  // ==================== PROFILE METHODS ====================

  getProfile(id: string, visibility?: string): Observable<Profile> {
    return this.invokeCommand<Profile>("get_profile", { id, visibility });
  }

  getProfiles(options?: {
    page?: number;
    limit?: number;
    visibility?: string;
    filter?: unknown;
  }): Observable<ProfileListResponse> {
    return this.invokeCommand<ProfileListResponse>("get_profiles", {
      page: options?.page,
      limit: options?.limit,
      visibility: options?.visibility,
      filter: options?.filter,
    });
  }

  createProfile(data: ProfileCreateRequest): Observable<Profile> {
    return this.invokeCommand<Profile>("create_profile", { data });
  }

  updateProfile(id: string, data: ProfileUpdateRequest): Observable<Profile> {
    return this.invokeCommand<Profile>("update_profile", { id, data });
  }

  deleteProfile(id: string): Observable<void> {
    return this.invokeCommand<void>("delete_profile", { id });
  }

  // ==================== CHAT METHODS ====================

  getChats(options?: {
    page?: number;
    limit?: number;
    visibility?: string;
    filter?: unknown;
    load?: string;
  }): Observable<ChatListResponse> {
    return this.invokeCommand<ChatListResponse>("get_chats", {
      page: options?.page,
      limit: options?.limit,
      visibility: options?.visibility,
      filter: options?.filter,
      load: options?.load,
    });
  }

  createChat(data: ChatCreateRequest): Observable<Chat> {
    return this.invokeCommand<Chat>("create_chat", { data });
  }

  updateChat(id: string, data: ChatUpdateRequest): Observable<Chat> {
    return this.invokeCommand<Chat>("update_chat", { id, data });
  }

  deleteChat(id: string, visibility?: string): Observable<void> {
    return this.invokeCommand<void>("delete_chat", { id, visibility });
  }

  // ==================== COMMENT METHODS ====================

  getComments(options?: {
    page?: number;
    limit?: number;
    visibility?: string;
    filter?: unknown;
    load?: string;
  }): Observable<CommentListResponse> {
    return this.invokeCommand<CommentListResponse>("get_comments", {
      page: options?.page,
      limit: options?.limit,
      visibility: options?.visibility,
      filter: options?.filter,
      load: options?.load,
    });
  }

  createComment(data: CommentCreateRequest): Observable<Comment> {
    return this.invokeCommand<Comment>("create_comment", { data });
  }

  deleteComment(id: string, visibility?: string): Observable<void> {
    return this.invokeCommand<void>("delete_comment", { id, visibility });
  }

  // ==================== USER METHODS ====================

  getUsers(options?: {
    page?: number;
    limit?: number;
    visibility?: string;
  }): Observable<UserListResponse> {
    return this.invokeCommand<UserListResponse>("get_users", {
      page: options?.page,
      limit: options?.limit,
      visibility: options?.visibility,
    });
  }

  login(data: LoginRequest): Observable<User> {
    return this.invokeCommand<User>("login", { data });
  }

  register(data: RegisterRequest): Observable<User> {
    return this.invokeCommand<User>("register", { data });
  }

  // ==================== ADMIN METHODS ====================

  adminGetAll(): Observable<unknown> {
    return this.invokeCommand<unknown>("admin_get_all", {});
  }

  adminGetPaginated(dataType: string, skip: number, limit: number): Observable<unknown> {
    return this.invokeCommand<unknown>("admin_get_paginated", { data_type: dataType, skip, limit });
  }

  adminToggleDelete(table: string, id: string): Observable<void> {
    return this.invokeCommand<void>("admin_toggle_delete", { table, id });
  }

  adminPermanentlyDelete(table: string, id: string): Observable<void> {
    return this.invokeCommand<void>("admin_permanently_delete", { table, id });
  }

  adminToggleDeleteLocal(table: string, id: string): Observable<void> {
    return this.invokeCommand<void>("admin_toggle_delete_local", { table, id });
  }

  adminPermanentlyDeleteLocal(table: string, id: string): Observable<void> {
    return this.invokeCommand<void>("admin_permanently_delete_local", { table, id });
  }

  adminGetAllArchive(): Observable<unknown> {
    return this.invokeCommand<unknown>("admin_get_all_archive", {});
  }

  adminGetArchivePaginated(dataType: string, skip: number, limit: number): Observable<unknown> {
    return this.invokeCommand<unknown>("admin_get_archive_paginated", {
      data_type: dataType,
      skip,
      limit,
    });
  }

  // ==================== CASCADE OPERATIONS ====================

  batchSoftDelete(table: string, ids: string[]): Observable<CascadeResult> {
    return this.invokeCommand<CascadeResult>("batch_soft_delete_cascade", { table, ids });
  }

  batchHardDelete(table: string, ids: string[]): Observable<CascadeResult> {
    return this.invokeCommand<CascadeResult>("batch_hard_delete_cascade", { table, ids });
  }

  batchRestore(table: string, ids: string[]): Observable<CascadeResult> {
    return this.invokeCommand<CascadeResult>("batch_restore_cascade", { table, ids });
  }
}
