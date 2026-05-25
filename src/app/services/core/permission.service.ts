import { Injectable, inject } from "@angular/core";
import { firstValueFrom } from "rxjs";
import { ApiService } from "@services/api.service";
import { JwtTokenService } from "@services/auth/jwt-token.service";

export enum TodoPermission {
  VIEWER = "viewer",
  EDITOR = "editor",
  MODERATOR = "moderator",
  OWNER = "owner",
}

export interface TodoPermissionContext {
  todo: any;
  assigneeRoles: Record<string, string>;
  userId: string;
}

@Injectable({ providedIn: "root" })
export class PermissionService {
  private api = inject(ApiService);
  private jwtTokenService = inject(JwtTokenService);

  isGlobalAdmin(): boolean {
    const token = this.jwtTokenService.getToken();
    return this.jwtTokenService.hasRole(token, "admin");
  }

  getUserPermission(context: TodoPermissionContext): TodoPermission {
    const { todo, assigneeRoles, userId } = context;

    if (todo.user_id === userId) {
      return TodoPermission.OWNER;
    }

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

  canEditTodoFields(permission: TodoPermission): boolean {
    return [TodoPermission.MODERATOR, TodoPermission.OWNER].includes(permission);
  }

  canDeleteTodo(permission: TodoPermission): boolean {
    return permission === TodoPermission.OWNER;
  }

  canArchiveTodo(permission: TodoPermission): boolean {
    return permission === TodoPermission.OWNER;
  }

  canArchiveTask(task: any, permission: TodoPermission, userId: string): boolean {
    if ([TodoPermission.MODERATOR, TodoPermission.OWNER].includes(permission)) {
      return true;
    }
    if (permission === TodoPermission.EDITOR) {
      return task.user_id === userId;
    }
    return false;
  }

  canArchiveSubtask(subtask: any, permission: TodoPermission, userId: string): boolean {
    if ([TodoPermission.MODERATOR, TodoPermission.OWNER].includes(permission)) {
      return true;
    }
    if (permission === TodoPermission.EDITOR) {
      return subtask.user_id === userId;
    }
    return false;
  }

  canArchiveComment(comment: any, permission: TodoPermission, userId: string): boolean {
    if ([TodoPermission.MODERATOR, TodoPermission.OWNER].includes(permission)) {
      return true;
    }
    if (permission === TodoPermission.EDITOR) {
      return comment.user_id === userId;
    }
    return false;
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

  canEditTask(task: any, permission: TodoPermission, userId: string): boolean {
    if ([TodoPermission.MODERATOR, TodoPermission.OWNER].includes(permission)) {
      return true;
    }
    if (permission === TodoPermission.EDITOR) {
      return task.user_id === userId;
    }
    return false;
  }

  canDeleteTask(task: any, permission: TodoPermission, userId: string): boolean {
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

  canEditSubtask(subtask: any, permission: TodoPermission, userId: string): boolean {
    if ([TodoPermission.MODERATOR, TodoPermission.OWNER].includes(permission)) {
      return true;
    }
    if (permission === TodoPermission.EDITOR) {
      return subtask.user_id === userId;
    }
    return false;
  }

  canDeleteSubtask(subtask: any, permission: TodoPermission, userId: string): boolean {
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

  canEditComment(comment: any, permission: TodoPermission, userId: string): boolean {
    if ([TodoPermission.MODERATOR, TodoPermission.OWNER].includes(permission)) {
      return true;
    }
    if (permission === TodoPermission.EDITOR) {
      return comment.user_id === userId;
    }
    return false;
  }

  canDeleteComment(comment: any, permission: TodoPermission, userId: string): boolean {
    if ([TodoPermission.MODERATOR, TodoPermission.OWNER].includes(permission)) {
      return true;
    }
    if (permission === TodoPermission.EDITOR) {
      return comment.user_id === userId;
    }
    return false;
  }

  canViewTodo(_permission: TodoPermission): boolean {
    return true;
  }

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
}
