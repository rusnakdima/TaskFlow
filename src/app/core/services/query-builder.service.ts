import { Injectable } from "@angular/core";
import { EntityType, VisibilityFilter } from "@entities/storage.model";
export interface FilterOptions {
  visibility?: VisibilityFilter | string;
  todoId?: string;
  taskId?: string;
  subtaskId?: string;
  status?: string;
  priority?: string;
  deleted?: boolean;
  search?: string;
  [key: string]: any;
}
@Injectable({ providedIn: "root" })
export class QueryBuilder {
  buildQuery(entityType: EntityType, filters: FilterOptions): any {
    const query: any = {};
    if (filters.visibility && filters.visibility !== "all") {
      Object.assign(query, this.buildVisibilityFilter(filters.visibility as string));
    }
    if (filters.todoId) query.todo_id = filters.todoId;
    if (filters.taskId) query.task_id = filters.taskId;
    if (filters.subtaskId) query.subtask_id = filters.subtaskId;
    if (filters.status) query.status = filters.status;
    if (filters.priority) query.priority = filters.priority;
    if (filters.deleted !== undefined) query.deleted_at = filters.deleted ? { $ne: null } : null;
    if (filters.search) query.$or = this.buildSearchFilter(filters.search, entityType);
    return query;
  }
  buildVisibilityFilter(visibility: string): any {
    switch (visibility) {
      case "private":
        return { visibility: "private" };
      case "shared":
        return { visibility: "shared" };
      case "public":
        return { visibility: "public" };
      case "all":
      default:
        return {};
    }
  }
  combineFilters(filters: any[]): any {
    if (!filters || filters.length === 0) return {};
    if (filters.length === 1) return filters[0];
    const combined: any = { $and: [] };
    filters.forEach((f) => {
      if (f && Object.keys(f).length > 0) {
        if (f.$and) {
          combined.$and.push(...f.$and);
        } else {
          combined.$and.push(f);
        }
      }
    });
    return combined.$and.length > 0 ? combined : {};
  }
  private buildSearchFilter(search: string, entityType: EntityType): any[] {
    const searchFields = this.getSearchFields(entityType);
    return searchFields.map((field) => ({ [field]: { $regex: search, $options: "i" } }));
  }
  private getSearchFields(entityType: EntityType): string[] {
    switch (entityType) {
      case "todos":
        return ["title", "description"];
      case "tasks":
        return ["title", "description"];
      case "subtasks":
        return ["title", "description"];
      case "comments":
        return ["content"];
      case "chats":
        return ["message"];
      case "categories":
        return ["name", "description"];
      default:
        return ["title"];
    }
  }
}
