/* sys lib */
import { Injectable, inject } from "@angular/core";
import { ActivatedRouteSnapshot, Resolve, RouterStateSnapshot } from "@angular/router";
import { firstValueFrom, of, timeout } from "rxjs";

/* services */
import { StorageService } from "@services/core/storage.service";
import { DataLoaderService } from "@services/data/data-loader.service";
import { RelationLoadingService } from "@services/core/relation-loading.service";
import { ApiProvider } from "@providers/api.provider";

/**
 * MainResolver - Storage-First with Fallback Loading
 *
 * This resolver returns data from StorageService.
 * If data is not found, it triggers a direct API call and waits.
 */
@Injectable({
  providedIn: "root",
})
export class MainResolver implements Resolve<any> {
  private storageService = inject(StorageService);
  private dataLoaderService = inject(DataLoaderService);
  private relationLoader = inject(RelationLoadingService);
  private apiProvider = inject(ApiProvider);

  private readonly TODO_LOAD_RELATIONS = [
    "user",
    "categories",
    "tasks",
    "tasks.subtasks",
    "tasks.subtasks.comments",
    "tasks.comments",
    "assignees",
  ];

  async resolve(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Promise<Object | string> {
    const paramsMap = route.paramMap;

    try {
      if (paramsMap.get("taskId")) {
        const taskId = paramsMap.get("taskId") ?? "";
        const todoId = paramsMap.get("todoId") ?? "";

        let todoFromStorage = this.storageService.getById("todos", todoId);

        // If todo not in storage, load it directly
        if (!todoFromStorage) {
          todoFromStorage = await this.loadTodoDirectly(todoId);
        }

        const taskFromStorage = this.storageService.getById("tasks", taskId);

        if (todoFromStorage || taskFromStorage) {
          return { task: taskFromStorage || null, todo: todoFromStorage || null };
        }

        return { task: null, todo: null, error: "not_found" };
      } else if (paramsMap.get("todoId")) {
        const todoId = paramsMap.get("todoId") ?? "";

        let todoFromStorage = this.storageService.getById("todos", todoId);

        // If todo not in storage, load it directly
        if (!todoFromStorage) {
          todoFromStorage = await this.loadTodoDirectly(todoId);
        }

        if (todoFromStorage) {
          return todoFromStorage;
        }

        return { id: todoId, error: "not_found" };
      } else {
        return "";
      }
    } catch {
      return { error: "offline" };
    }
  }

  private async loadTodoDirectly(todoId: string): Promise<any> {
    try {
      const todo = await firstValueFrom(
        this.relationLoader
          .loadMany<any>(this.apiProvider, "todos", { id: todoId }, this.TODO_LOAD_RELATIONS, {
            is_owner: true,
            is_private: true,
          })
          .pipe(timeout({ first: 10000 }))
      );

      if (todo && Array.isArray(todo) && todo.length > 0) {
        const todoData = todo[0];
        this.storageService.setCollection("privateTodos", [todoData]);
        return todoData;
      }
      return null;
    } catch (error) {
      console.error("[MainResolver] Failed to load todo directly:", error);
      return null;
    }
  }
}
