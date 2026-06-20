export enum TodoPermission {
  VIEWER = "viewer",
  EDITOR = "editor",
  MODERATOR = "moderator",
  OWNER = "owner",
}
export const ASSIGNEE_DEFAULT_ROLE = "viewer";
export interface AssigneeRole {
  profileId: string;
  role: TodoPermission;
}
export interface TodoPermissionCheck {
  canEditTodo: boolean;
  canDeleteTodo: boolean;
  canManageAssignees: boolean;
  canTransferOwnership: boolean;
  canCreateTask: boolean;
  canEditTask: boolean;
  canDeleteTask: boolean;
  permission: TodoPermission;
}
export function getPermissionFromRole(role: string): TodoPermission {
  const lowerRole = role.toLowerCase();
  switch (lowerRole) {
    case "viewer":
      return TodoPermission.VIEWER;
    case "editor":
      return TodoPermission.EDITOR;
    case "admin":
    case "moderator":
      return TodoPermission.MODERATOR;
    case "owner":
      return TodoPermission.OWNER;
    default:
      return TodoPermission.VIEWER;
  }
}
export function hasEditPermission(permission: TodoPermission): boolean {
  return permission === TodoPermission.MODERATOR || permission === TodoPermission.OWNER;
}
export function hasDeletePermission(permission: TodoPermission): boolean {
  return permission === TodoPermission.OWNER;
}
export function hasManagePermissionsPermission(permission: TodoPermission): boolean {
  return permission === TodoPermission.MODERATOR || permission === TodoPermission.OWNER;
}
export function hasTransferOwnershipPermission(permission: TodoPermission): boolean {
  return permission === TodoPermission.OWNER;
}
export function hasCreateTaskPermission(permission: TodoPermission): boolean {
  return (
    permission === TodoPermission.EDITOR ||
    permission === TodoPermission.MODERATOR ||
    permission === TodoPermission.OWNER
  );
}
