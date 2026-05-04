import { Injectable } from "@angular/core";
import { Todo } from "@models/todo.model";

@Injectable({ providedIn: "root" })
export class AuthorizationService {
  canUserEdit(todo: Todo | null, userId: string): boolean {
    if (!todo || !userId) return false;
    if (todo.user_id === userId) return true;
    if (todo.visibility !== "private") return true;
    return false;
  }

  isOwner(ownerId: string, userId: string): boolean {
    return ownerId === userId;
  }

  canUserDelete(todo: Todo | null, userId: string): boolean {
    return this.canUserEdit(todo, userId);
  }

  canUserView(todo: Todo | null, userId: string): boolean {
    if (!todo) return false;
    if (todo.visibility !== "private") return true;
    return todo.user_id === userId;
  }
}
