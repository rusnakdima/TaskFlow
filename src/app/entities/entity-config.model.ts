import { Visibility } from "@entities/api.model";
export type StorageTarget = "local" | "cloud";
export interface EntityConfig {
  type: EntityType;
  storageTarget: StorageTarget;
  visibility?: Visibility;
  parentId?: string;
  parentType?: EntityType;
}
export type EntityType =
  | "todos"
  | "tasks"
  | "subtasks"
  | "comments"
  | "chats"
  | "categories"
  | "profiles"
  | "users"
  | "dailyActivities";
export interface CreateContext {
  targetDb: StorageTarget;
  visibility?: Visibility;
  todoId?: string;
  taskId?: string;
}
export interface UpdateContext {
  targetDb: StorageTarget;
  visibility?: Visibility;
}
export interface PermissionContext {
  todoId: string;
  userId: string;
  todoVisibility: Visibility;
  assigneeRoles: Record<string, string>;
  isOwner: boolean;
  isGlobalAdmin: boolean;
}
export interface PermissionCheckResult {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canArchive: boolean;
  canManageAssignees: boolean;
  permissionLevel: TodoPermissionLevel;
}
export type TodoPermissionLevel = "viewer" | "editor" | "moderator" | "owner";
export interface CategoryVisibilityOption {
  id: StorageTarget;
  label: string;
  icon: string;
}
export const CATEGORY_VISIBILITY_OPTIONS: CategoryVisibilityOption[] = [
  { id: "local", label: "Local", icon: "folder" },
  { id: "cloud", label: "Cloud", icon: "cloud" },
];
export interface TodoVisibilityOption {
  id: Visibility;
  label: string;
  icon: string;
}
export const TODO_VISIBILITY_OPTIONS: TodoVisibilityOption[] = [
  { id: "private", label: "Private", icon: "lock" },
  { id: "shared", label: "Shared", icon: "group" },
  { id: "public", label: "Public", icon: "public" },
];
