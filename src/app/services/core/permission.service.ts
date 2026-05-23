import { Injectable, inject } from "@angular/core";
import { firstValueFrom } from "rxjs";
import { ApiService } from "@services/api.service";

export enum TodoPermission {
  VIEWER = "viewer",
  EDITOR = "editor",
  ADMIN = "admin",
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
      return TodoPermission.VIEWER;
    }

    if (todo.visibility === "shared") {
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
        return TodoPermission.ADMIN;
      case "moderator":
        return TodoPermission.MODERATOR;
      case "owner":
        return TodoPermission.OWNER;
      default:
        return TodoPermission.VIEWER;
    }
  }

  canEditTodoFields(permission: TodoPermission): boolean {
    return [TodoPermission.ADMIN, TodoPermission.MODERATOR, TodoPermission.OWNER].includes(
      permission
    );
  }

  canDeleteTodo(permission: TodoPermission): boolean {
    return [TodoPermission.ADMIN, TodoPermission.MODERATOR, TodoPermission.OWNER].includes(
      permission
    );
  }

  canManageAssignees(permission: TodoPermission): boolean {
    return [TodoPermission.ADMIN, TodoPermission.MODERATOR, TodoPermission.OWNER].includes(
      permission
    );
  }

  canManageGhRepo(permission: TodoPermission): boolean {
    return [TodoPermission.ADMIN, TodoPermission.MODERATOR, TodoPermission.OWNER].includes(
      permission
    );
  }

  canTransferOwnership(permission: TodoPermission): boolean {
    return [TodoPermission.ADMIN, TodoPermission.MODERATOR, TodoPermission.OWNER].includes(
      permission
    );
  }

  canCreateTask(permission: TodoPermission): boolean {
    return [
      TodoPermission.EDITOR,
      TodoPermission.ADMIN,
      TodoPermission.MODERATOR,
      TodoPermission.OWNER,
    ].includes(permission);
  }

  canEditTask(_task: any, permission: TodoPermission, _userId: string): boolean {
    if (
      [TodoPermission.ADMIN, TodoPermission.MODERATOR, TodoPermission.OWNER].includes(permission)
    ) {
      return true;
    }
    if (permission === TodoPermission.EDITOR) {
      return true;
    }
    return false;
  }

  canDeleteTask(task: any, permission: TodoPermission, userId: string): boolean {
    return this.canEditTask(task, permission, userId);
  }

  canCreateSubtask(permission: TodoPermission): boolean {
    return this.canCreateTask(permission);
  }

  canEditSubtask(_subtask: any, permission: TodoPermission, _userId: string): boolean {
    if (
      [TodoPermission.ADMIN, TodoPermission.MODERATOR, TodoPermission.OWNER].includes(permission)
    ) {
      return true;
    }
    if (permission === TodoPermission.EDITOR) {
      return true;
    }
    return false;
  }

  canDeleteSubtask(subtask: any, permission: TodoPermission, userId: string): boolean {
    return this.canEditSubtask(subtask, permission, userId);
  }

  canCreateComment(permission: TodoPermission): boolean {
    return this.canCreateTask(permission);
  }

  canEditComment(comment: any, permission: TodoPermission, userId: string): boolean {
    if (
      [TodoPermission.ADMIN, TodoPermission.MODERATOR, TodoPermission.OWNER].includes(permission)
    ) {
      return true;
    }
    if (permission === TodoPermission.EDITOR) {
      return comment.user_id === userId;
    }
    return false;
  }

  canDeleteComment(comment: any, permission: TodoPermission, userId: string): boolean {
    return this.canEditComment(comment, permission, userId);
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
