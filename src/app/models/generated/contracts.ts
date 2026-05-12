// AUTO-GENERATED - Do not edit manually
// This file contains TypeScript contracts (API call interfaces) for backend commands

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
  UserListResponse,
  CascadeResult,
} from "./api.types";

export const Contracts = {
  // ==================== TODO CONTRACTS ====================
  getTodo: {
    command: "get_todo",
    request: (id: string, visibility?: string) => ({ id, visibility }),
    response: {} as ApiResponse<Todo>,
  },
  getTodos: {
    command: "get_todos",
    request: (options?: {
      page?: number;
      limit?: number;
      visibility?: string;
      filter?: unknown;
      sort?: unknown;
    }) => options || {},
    response: {} as ApiResponse<TodoListResponse>,
  },
  createTodo: {
    command: "create_todo",
    request: (data: TodoCreateRequest) => ({ data }),
    response: {} as ApiResponse<Todo>,
  },
  updateTodo: {
    command: "update_todo",
    request: (id: string, data: TodoUpdateRequest, visibility?: string) => ({
      id,
      data,
      visibility,
    }),
    response: {} as ApiResponse<Todo>,
  },
  deleteTodo: {
    command: "delete_todo",
    request: (id: string, visibility?: string) => ({ id, visibility }),
    response: {} as ApiResponse<null>,
  },

  // ==================== TASK CONTRACTS ====================
  getTask: {
    command: "get_task",
    request: (id: string, visibility?: string, load?: string) => ({ id, visibility, load }),
    response: {} as ApiResponse<Task>,
  },
  getTasks: {
    command: "get_tasks",
    request: (options?: {
      page?: number;
      limit?: number;
      visibility?: string;
      filter?: unknown;
      sort?: unknown;
      load?: string;
    }) => options || {},
    response: {} as ApiResponse<TaskListResponse>,
  },
  createTask: {
    command: "create_task",
    request: (data: TaskCreateRequest) => ({ data }),
    response: {} as ApiResponse<Task>,
  },
  updateTask: {
    command: "update_task",
    request: (id: string, data: TaskUpdateRequest, visibility?: string) => ({
      id,
      data,
      visibility,
    }),
    response: {} as ApiResponse<Task>,
  },
  deleteTask: {
    command: "delete_task",
    request: (id: string, visibility?: string) => ({ id, visibility }),
    response: {} as ApiResponse<null>,
  },

  // ==================== SUBTASK CONTRACTS ====================
  getSubtask: {
    command: "get_subtask",
    request: (id: string, visibility?: string, load?: string) => ({ id, visibility, load }),
    response: {} as ApiResponse<Subtask>,
  },
  getSubtasks: {
    command: "get_subtasks",
    request: (options?: {
      page?: number;
      limit?: number;
      visibility?: string;
      filter?: unknown;
      sort?: unknown;
      load?: string;
    }) => options || {},
    response: {} as ApiResponse<SubtaskListResponse>,
  },
  createSubtask: {
    command: "create_subtask",
    request: (data: SubtaskCreateRequest) => ({ data }),
    response: {} as ApiResponse<Subtask>,
  },
  updateSubtask: {
    command: "update_subtask",
    request: (id: string, data: SubtaskUpdateRequest, visibility?: string) => ({
      id,
      data,
      visibility,
    }),
    response: {} as ApiResponse<Subtask>,
  },
  deleteSubtask: {
    command: "delete_subtask",
    request: (id: string, visibility?: string) => ({ id, visibility }),
    response: {} as ApiResponse<null>,
  },

  // ==================== CATEGORY CONTRACTS ====================
  getCategory: {
    command: "get_category",
    request: (id: string, visibility?: string, load?: string) => ({ id, visibility, load }),
    response: {} as ApiResponse<Category>,
  },
  getCategories: {
    command: "get_categories",
    request: (options?: {
      page?: number;
      limit?: number;
      visibility?: string;
      filter?: unknown;
      load?: string;
    }) => options || {},
    response: {} as ApiResponse<CategoryListResponse>,
  },
  createCategory: {
    command: "create_category",
    request: (data: CategoryCreateRequest) => ({ data }),
    response: {} as ApiResponse<Category>,
  },
  updateCategory: {
    command: "update_category",
    request: (id: string, data: CategoryUpdateRequest) => ({ id, data }),
    response: {} as ApiResponse<Category>,
  },
  deleteCategory: {
    command: "delete_category",
    request: (id: string, visibility?: string) => ({ id, visibility }),
    response: {} as ApiResponse<null>,
  },

  // ==================== PROFILE CONTRACTS ====================
  getProfile: {
    command: "get_profile",
    request: (id: string, visibility?: string) => ({ id, visibility }),
    response: {} as ApiResponse<Profile>,
  },
  getProfiles: {
    command: "get_profiles",
    request: (options?: { page?: number; limit?: number; visibility?: string; filter?: unknown }) =>
      options || {},
    response: {} as ApiResponse<ProfileListResponse>,
  },
  createProfile: {
    command: "create_profile",
    request: (data: ProfileCreateRequest) => ({ data }),
    response: {} as ApiResponse<Profile>,
  },
  updateProfile: {
    command: "update_profile",
    request: (id: string, data: ProfileUpdateRequest) => ({ id, data }),
    response: {} as ApiResponse<Profile>,
  },
  deleteProfile: {
    command: "delete_profile",
    request: (id: string) => ({ id }),
    response: {} as ApiResponse<null>,
  },

  // ==================== CHAT CONTRACTS ====================
  getChats: {
    command: "get_chats",
    request: (options?: {
      page?: number;
      limit?: number;
      visibility?: string;
      filter?: unknown;
      load?: string;
    }) => options || {},
    response: {} as ApiResponse<ChatListResponse>,
  },
  createChat: {
    command: "create_chat",
    request: (data: ChatCreateRequest) => ({ data }),
    response: {} as ApiResponse<Chat>,
  },
  updateChat: {
    command: "update_chat",
    request: (id: string, data: ChatUpdateRequest) => ({ id, data }),
    response: {} as ApiResponse<Chat>,
  },
  deleteChat: {
    command: "delete_chat",
    request: (id: string, visibility?: string) => ({ id, visibility }),
    response: {} as ApiResponse<null>,
  },

  // ==================== COMMENT CONTRACTS ====================
  getComments: {
    command: "get_comments",
    request: (options?: {
      page?: number;
      limit?: number;
      visibility?: string;
      filter?: unknown;
      load?: string;
    }) => options || {},
    response: {} as ApiResponse<CommentListResponse>,
  },
  createComment: {
    command: "create_comment",
    request: (data: CommentCreateRequest) => ({ data }),
    response: {} as ApiResponse<Comment>,
  },
  deleteComment: {
    command: "delete_comment",
    request: (id: string, visibility?: string) => ({ id, visibility }),
    response: {} as ApiResponse<null>,
  },

  // ==================== USER CONTRACTS ====================
  getUsers: {
    command: "get_users",
    request: (options?: { page?: number; limit?: number; visibility?: string }) => options || {},
    response: {} as ApiResponse<UserListResponse>,
  },
  login: {
    command: "login",
    request: (data: LoginRequest) => ({ data }),
    response: {} as ApiResponse<User>,
  },
  register: {
    command: "register",
    request: (data: RegisterRequest) => ({ data }),
    response: {} as ApiResponse<User>,
  },

  // ==================== ADMIN CONTRACTS ====================
  adminGetAll: {
    command: "admin_get_all",
    request: () => ({}),
    response: {} as ApiResponse<unknown>,
  },
  adminGetPaginated: {
    command: "admin_get_paginated",
    request: (dataType: string, skip: number, limit: number) => ({
      data_type: dataType,
      skip,
      limit,
    }),
    response: {} as ApiResponse<unknown>,
  },
  adminToggleDelete: {
    command: "admin_toggle_delete",
    request: (table: string, id: string) => ({ table, id }),
    response: {} as ApiResponse<null>,
  },
  adminPermanentlyDelete: {
    command: "admin_permanently_delete",
    request: (table: string, id: string) => ({ table, id }),
    response: {} as ApiResponse<null>,
  },
  adminToggleDeleteLocal: {
    command: "admin_toggle_delete_local",
    request: (table: string, id: string) => ({ table, id }),
    response: {} as ApiResponse<null>,
  },
  adminPermanentlyDeleteLocal: {
    command: "admin_permanently_delete_local",
    request: (table: string, id: string) => ({ table, id }),
    response: {} as ApiResponse<null>,
  },
  adminGetAllArchive: {
    command: "admin_get_all_archive",
    request: () => ({}),
    response: {} as ApiResponse<unknown>,
  },
  adminGetArchivePaginated: {
    command: "admin_get_archive_paginated",
    request: (dataType: string, skip: number, limit: number) => ({
      data_type: dataType,
      skip,
      limit,
    }),
    response: {} as ApiResponse<unknown>,
  },

  // ==================== CASCADE OPERATIONS ====================
  batchSoftDelete: {
    command: "batch_soft_delete_cascade",
    request: (table: string, ids: string[]) => ({ table, ids }),
    response: {} as ApiResponse<CascadeResult>,
  },
  batchHardDelete: {
    command: "batch_hard_delete_cascade",
    request: (table: string, ids: string[]) => ({ table, ids }),
    response: {} as ApiResponse<CascadeResult>,
  },
  batchRestore: {
    command: "batch_restore_cascade",
    request: (table: string, ids: string[]) => ({ table, ids }),
    response: {} as ApiResponse<CascadeResult>,
  },
} as const;

export type ContractName = keyof typeof Contracts;
export type ContractRequest<T extends ContractName> = ReturnType<(typeof Contracts)[T]["request"]>;
export type ContractResponse<T extends ContractName> = (typeof Contracts)[T]["response"];
