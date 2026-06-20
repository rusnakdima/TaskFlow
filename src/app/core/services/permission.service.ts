import { Injectable, inject, signal } from "@angular/core";
import { firstValueFrom } from "rxjs";
import { Todo, Task, Subtask, Comment } from "@entities/generated/api.types";
import { ApiService } from "@services/api.service";
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { TodoPermissionLevel, PermissionCheckResult } from "@entities/entity-config.model";
export enum TodoPermission {
  VIEWER = "viewer",
  EDITOR = "editor",
  MODERATOR = "moderator",
  OWNER = "owner",
}
export interface TodoPermissionContext {
  todo: Todo;
  userId: string;
  assigneeRoles: Record<string, string>;
  effectivePermission: TodoPermission;
}
export interface TaskPermissionContext {
  task: Task;
  todo: Todo;
  userId: string;
  todoPermission: TodoPermission;
}
export interface SubtaskPermissionContext {
  subtask: Subtask;
  task: Task;
  todo: Todo;
  userId: string;
  todoPermission: TodoPermission;
}
@Injectable({ providedIn: "root" })
export class PermissionService {
  private api = inject(ApiService);
  private jwtTokenService = inject(JwtTokenService);
  private permissionCache = signal<Map<string, TodoPermission>>(new Map());
  isGlobalAdmin(): boolean {
    const token = this.jwtTokenService.getToken();
    return this.jwtTokenService.hasRole(token, "admin");
  }
  getCurrentUserId(): string {
    return this.jwtTokenService.getCurrentUserId() || "";
  }
  fromStr(role: string): TodoPermission {
    switch (role.toLowerCase()) {
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
  toLevel(permission: TodoPermission): TodoPermissionLevel {
    return permission as TodoPermissionLevel;
  }
  /* ════════════════════════════════════════════════════════════════════════
     CONTEXT CREATION - Create permission context from todo
     ════════════════════════════════════════════════════════════════════════ */
  createTodoPermissionContext(todo: Todo, userId?: string): TodoPermissionContext {
    const uid = userId || this.getCurrentUserId();
    const effectivePermission = this.getTodoPermission(todo, uid);
    return {
      todo,
      userId: uid,
      assigneeRoles: (todo as any).assignee_roles || {},
      effectivePermission,
    };
  }
  createTaskPermissionContext(task: Task, todo: Todo, userId?: string): TaskPermissionContext {
    const uid = userId || this.getCurrentUserId();
    const todoPermission = this.getTodoPermission(todo, uid);
    return {
      task,
      todo,
      userId: uid,
      todoPermission,
    };
  }
  createSubtaskPermissionContext(
    subtask: Subtask,
    task: Task,
    todo: Todo,
    userId?: string
  ): SubtaskPermissionContext {
    const uid = userId || this.getCurrentUserId();
    const todoPermission = this.getTodoPermission(todo, uid);
    return {
      subtask,
      task,
      todo,
      userId: uid,
      todoPermission,
    };
  }
  /* ════════════════════════════════════════════════════════════════════════
     PERMISSION CALCULATION - Single source of truth for permission logic
     ════════════════════════════════════════════════════════════════════════ */
  getTodoPermission(todo: Todo, userId: string): TodoPermission {
    if (todo.user_id === userId) {
      return TodoPermission.OWNER;
    }
    const assigneeRoles = ((todo as any).assignee_roles as Record<string, string>) || {};
    const role = assigneeRoles[userId];
    if (role) {
      return this.fromStr(role);
    }
    if (todo.visibility === "public") {
      if (this.isGlobalAdmin()) {
        return TodoPermission.MODERATOR;
      }
      return TodoPermission.VIEWER;
    }
    if (todo.visibility === "shared") {
      if (this.isGlobalAdmin()) {
        return TodoPermission.MODERATOR;
      }
      if (todo.assignees?.includes(userId)) {
        return TodoPermission.VIEWER;
      }
    }
    return TodoPermission.VIEWER;
  }
  /* ════════════════════════════════════════════════════════════════════════
     PERMISSION CHECKS - Standardized permission checks
     ════════════════════════════════════════════════════════════════════════ */
  canViewTodo(_permission: TodoPermission): boolean {
    return true;
  }
  canEditTodoFields(permission: TodoPermission): boolean {
    return [TodoPermission.MODERATOR, TodoPermission.OWNER].includes(permission);
  }
  canDeleteTodo(permission: TodoPermission): boolean {
    return permission === TodoPermission.OWNER;
  }
  canArchiveTodo(permission: TodoPermission): boolean {
    return permission === TodoPermission.OWNER;
  }
  canManageAssignees(permission: TodoPermission): boolean {
    return [TodoPermission.MODERATOR, TodoPermission.OWNER].includes(permission);
  }
  canManageGhRepo(permission: TodoPermission): boolean {
    return [TodoPermission.MODERATOR, TodoPermission.OWNER].includes(permission);
  }
  canTransferOwnership(permission: TodoPermission): boolean {
    return [TodoPermission.MODERATOR, TodoPermission.OWNER].includes(permission);
  }
  canCreateTask(permission: TodoPermission): boolean {
    if (this.isGlobalAdmin()) return true;
    return [TodoPermission.EDITOR, TodoPermission.MODERATOR, TodoPermission.OWNER].includes(
      permission
    );
  }
  canEditTask(task: Task, permission: TodoPermission, userId: string): boolean {
    if ([TodoPermission.MODERATOR, TodoPermission.OWNER].includes(permission)) {
      return true;
    }
    if (permission === TodoPermission.EDITOR) {
      return task.user_id === userId;
    }
    return false;
  }
  canDeleteTask(task: Task, permission: TodoPermission, userId: string): boolean {
    if ([TodoPermission.MODERATOR, TodoPermission.OWNER].includes(permission)) {
      return true;
    }
    if (permission === TodoPermission.EDITOR) {
      return task.user_id === userId;
    }
    return false;
  }
  canArchiveTask(task: Task, permission: TodoPermission, userId: string): boolean {
    if ([TodoPermission.MODERATOR, TodoPermission.OWNER].includes(permission)) {
      return true;
    }
    if (permission === TodoPermission.EDITOR) {
      return task.user_id === userId;
    }
    return false;
  }
  canCreateSubtask(permission: TodoPermission): boolean {
    return this.canCreateTask(permission);
  }
  canEditSubtask(subtask: Subtask, permission: TodoPermission, userId: string): boolean {
    if ([TodoPermission.MODERATOR, TodoPermission.OWNER].includes(permission)) {
      return true;
    }
    if (permission === TodoPermission.EDITOR) {
      return subtask.user_id === userId;
    }
    return false;
  }
  canDeleteSubtask(subtask: Subtask, permission: TodoPermission, userId: string): boolean {
    if ([TodoPermission.MODERATOR, TodoPermission.OWNER].includes(permission)) {
      return true;
    }
    if (permission === TodoPermission.EDITOR) {
      return subtask.user_id === userId;
    }
    return false;
  }
  canArchiveSubtask(subtask: Subtask, permission: TodoPermission, userId: string): boolean {
    if ([TodoPermission.MODERATOR, TodoPermission.OWNER].includes(permission)) {
      return true;
    }
    if (permission === TodoPermission.EDITOR) {
      return subtask.user_id === userId;
    }
    return false;
  }
  canCreateComment(permission: TodoPermission): boolean {
    return this.canCreateTask(permission);
  }
  canEditComment(comment: Comment, permission: TodoPermission, userId: string): boolean {
    if ([TodoPermission.MODERATOR, TodoPermission.OWNER].includes(permission)) {
      return true;
    }
    if (permission === TodoPermission.EDITOR) {
      return comment.user_id === userId;
    }
    return false;
  }
  canDeleteComment(comment: Comment, permission: TodoPermission, userId: string): boolean {
    if ([TodoPermission.MODERATOR, TodoPermission.OWNER].includes(permission)) {
      return true;
    }
    if (permission === TodoPermission.EDITOR) {
      return comment.user_id === userId;
    }
    return false;
  }
  canArchiveComment(comment: Comment, permission: TodoPermission, userId: string): boolean {
    if ([TodoPermission.MODERATOR, TodoPermission.OWNER].includes(permission)) {
      return true;
    }
    if (permission === TodoPermission.EDITOR) {
      return comment.user_id === userId;
    }
    return false;
  }
  /* ════════════════════════════════════════════════════════════════════════
     CONTEXT-BASED CHECKS - Use context objects for checks
     ════════════════════════════════════════════════════════════════════════ */
  checkTodoPermissions(context: TodoPermissionContext): PermissionCheckResult {
    const perm = context.effectivePermission;
    return {
      canView: this.canViewTodo(perm),
      canCreate: this.canCreateTask(perm),
      canEdit: this.canEditTodoFields(perm),
      canDelete: this.canDeleteTodo(perm),
      canArchive: this.canArchiveTodo(perm),
      canManageAssignees: this.canManageAssignees(perm),
      permissionLevel: this.toLevel(perm),
    };
  }
  checkTaskPermissions(context: TaskPermissionContext): PermissionCheckResult {
    const perm = context.todoPermission;
    return {
      canView: this.canViewTodo(perm),
      canCreate: this.canCreateTask(perm),
      canEdit: this.canEditTask(context.task, perm, context.userId),
      canDelete: this.canDeleteTask(context.task, perm, context.userId),
      canArchive: this.canArchiveTask(context.task, perm, context.userId),
      canManageAssignees: this.canManageAssignees(perm),
      permissionLevel: this.toLevel(perm),
    };
  }
  checkSubtaskPermissions(context: SubtaskPermissionContext): PermissionCheckResult {
    const perm = context.todoPermission;
    return {
      canView: this.canViewTodo(perm),
      canCreate: this.canCreateSubtask(perm),
      canEdit: this.canEditSubtask(context.subtask, perm, context.userId),
      canDelete: this.canDeleteSubtask(context.subtask, perm, context.userId),
      canArchive: this.canArchiveSubtask(context.subtask, perm, context.userId),
      canManageAssignees: this.canManageAssignees(perm),
      permissionLevel: this.toLevel(perm),
    };
  }
  /* ════════════════════════════════════════════════════════════════════════
     ASYNC PERMISSION LOOKUP - For cases requiring server-side lookup
     ════════════════════════════════════════════════════════════════════════ */
  async getTodoPermissionsAsync(
    todoId: string,
    visibility: string,
    token: string
  ): Promise<Record<string, string>> {
    try {
      const result: any = await firstValueFrom(
        (this.api as any).invokeCommand("get_todo_permissions", {
          todo_id: todoId,
          visibility: visibility || "private",
          token: token || "",
        })
      );
      return result?.assignee_roles || result || {};
    } catch (e) {
      return {};
    }
  }
  getDefaultRole(): TodoPermission {
    return TodoPermission.VIEWER;
  }
  /* ════════════════════════════════════════════════════════════════════════
     UTILITY METHODS
     ════════════════════════════════════════════════════════════════════════ */
  isOwner(todo: Todo, userId?: string): boolean {
    const uid = userId || this.getCurrentUserId();
    return todo.user_id === uid;
  }
  isEditor(todo: Todo, userId?: string): boolean {
    const perm = this.getTodoPermission(todo, userId || this.getCurrentUserId());
    return perm === TodoPermission.EDITOR;
  }
  isModerator(todo: Todo, userId?: string): boolean {
    const perm = this.getTodoPermission(todo, userId || this.getCurrentUserId());
    return perm === TodoPermission.MODERATOR;
  }
  clearPermissionCache(): void {
    this.permissionCache.set(new Map());
  }
}
