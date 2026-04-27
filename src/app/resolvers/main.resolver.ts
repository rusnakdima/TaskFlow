/* sys lib */
import { Injectable, inject } from "@angular/core";
import { ActivatedRouteSnapshot, Resolve, RouterStateSnapshot } from "@angular/router";
import { of, catchError } from "rxjs";

/* models */
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";

/* services */
import { ApiProvider } from "@providers/api.provider";
import { StorageService } from "@services/core/storage.service";

/**
 * MainResolver - Non-Blocking Navigation Resolver
 *
 * This resolver NEVER blocks navigation. It returns immediately with:
 * 1. Cached data from storage (if available)
 * 2. null for missing data
 *
 * Data loading happens in background via:
 * - WebSocket (real-time updates)
 * - API fallback (fire-and-forget)
 *
 * Components use StorageService signals to react to data changes.
 */
@Injectable({
  providedIn: "root",
})
export class MainResolver implements Resolve<any> {
  private dataSyncProvider = inject(ApiProvider);
  private storageService = inject(StorageService);

  async resolve(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Promise<Object | string> {
    const paramsMap = route.paramMap;
    const queryParams = route.queryParams;

    const isOwner = queryParams["isOwner"] !== "false";
    const isPrivate = queryParams["isPrivate"] !== "false";

    try {
      if (paramsMap.get("taskId")) {
        const taskId = paramsMap.get("taskId") ?? "";
        const todoId = paramsMap.get("todoId") ?? "";

        // IMMEDIATELY return cached data (non-blocking)
        const taskFromStorage = this.storageService.getById("tasks", taskId);
        const todoFromStorage = this.storageService.getById("todos", todoId);

        if (taskFromStorage && todoFromStorage) {
          // Have cached data - return immediately
          return { task: taskFromStorage, todo: todoFromStorage };
        }

        // Return cached data if available (even if partial)
        if (todoFromStorage) {
          return { task: taskFromStorage, todo: todoFromStorage };
        }

        // No cached data - fire-and-forget API call, return null for missing
        this.loadTodoInBackground(isPrivate, todoId, isOwner);
        this.loadTaskInBackground(isPrivate, taskId, isOwner);

        return {
          task: taskFromStorage || null,
          todo: todoFromStorage || null,
          loading: true, // Signal to component that data is loading
        };
      } else if (paramsMap.get("todoId")) {
        const todoId = paramsMap.get("todoId") ?? "";

        // IMMEDIATELY return cached data (non-blocking)
        const todoFromStorage = this.storageService.getById("todos", todoId);

        if (todoFromStorage && this.hasFullRelations(todoFromStorage)) {
          return todoFromStorage;
        }

        // Fire-and-forget API call to load in background
        this.loadTodoInBackground(isPrivate, todoId, isOwner);

        return todoFromStorage || { id: todoId, loading: true };
      } else {
        return "";
      }
    } catch {
      return { error: "offline" };
    }
  }

  /**
   * Fire-and-forget: Load todo in background
   */
  private loadTodoInBackground(
    isPrivate: boolean,
    todo_id?: string,
    isOwner: boolean = true
  ): void {
    if (!todo_id) return;
    this.dataSyncProvider
      .crud<Todo>("get", "todos", {
        id: todo_id,
        isOwner,
        isPrivate,
        load: [
          "user",
          "categories",
          "tasks",
          // "tasks.subtasks",
          // "tasks.subtasks.comments",
          // "tasks.comments",
          "assignees",
        ],
      })
      .pipe(
        catchError(() => {
          return of(null);
        })
      )
      .subscribe((todo) => {
        if (todo) {
          this.upsertTodo(todo, todo_id);
        }
      });
  }

  /**
   * Fire-and-forget: Load task in background
   */
  private loadTaskInBackground(
    isPrivate: boolean,
    task_id?: string,
    isOwner: boolean = true
  ): void {
    if (!task_id) return;
    this.dataSyncProvider
      .crud<Task>("get", "tasks", {
        id: task_id,
        isOwner,
        isPrivate,
        load: ["subtasks", "comments"],
      })
      .pipe(
        catchError(() => {
          return of(null);
        })
      )
      .subscribe((task) => {
        if (task) {
          this.storageService.updateItem("tasks", task_id, task);
        }
      });
  }

  private upsertTodo(todo: Todo | null, todo_id?: string): void {
    if (!todo?.id) return;
    const id = todo_id || todo.id;
    const existing = this.storageService.getById("todos", id);
    if (existing) {
      this.storageService.updateItem("todos", id, todo);
    } else {
      this.storageService.addItem("todos", todo);
    }
  }

  private hasFullRelations(todo: Todo | undefined): boolean {
    if (!todo) return false;
    const hasCategories =
      todo.categories && todo.categories.length > 0 && typeof todo.categories[0] !== "string";
    const hasTasks = todo.tasks && todo.tasks.length > 0;
    return !!(hasCategories && hasTasks);
  }
}
