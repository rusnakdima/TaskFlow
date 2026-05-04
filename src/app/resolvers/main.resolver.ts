/* sys lib */
import { Injectable, inject } from "@angular/core";
import { ActivatedRouteSnapshot, Resolve, RouterStateSnapshot } from "@angular/router";
import { firstValueFrom } from "rxjs";

/* services */
import { StorageService } from "@services/core/storage.service";
import { DataLoaderService } from "@services/data/data-loader.service";

/* providers */
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
  private apiProvider = inject(ApiProvider);

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

        if (!todoFromStorage) {
          todoFromStorage = await this.loadTodoFromApi(todoId);
        }

        let taskFromStorage = this.storageService.getById("tasks", taskId);

        if (!taskFromStorage) {
          taskFromStorage = await this.loadTaskFromApi(taskId, todoId);
        }

        if (todoFromStorage || taskFromStorage) {
          return { task: taskFromStorage || null, todo: todoFromStorage || null };
        }

        return { task: null, todo: null, error: "not_found" };
      } else if (paramsMap.get("todoId")) {
        const todoId = paramsMap.get("todoId") ?? "";

        let todoFromStorage = this.storageService.getById("todos", todoId);

        if (!todoFromStorage) {
          todoFromStorage = await this.loadTodoFromApi(todoId);
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

  private async loadTodoFromApi(todoId: string): Promise<any> {
    try {
      const todo = await firstValueFrom(
        this.apiProvider.crud("get", "todos", {
          id: todoId,
          load: ["tasks", "tasks.subtasks", "tasks.comments", "categories", "assignees", "user"],
        })
      );
      if (todo) {
        this.storageService.addItem("todos", todo);
      }
      return todo;
    } catch {
      return null;
    }
  }

  private async loadTaskFromApi(taskId: string, todoId: string): Promise<any> {
    try {
      const task = await firstValueFrom(
        this.apiProvider.crud("get", "tasks", {
          id: taskId,
          load: ["subtasks", "comments", "assignees"],
        })
      );
      if (task) {
        this.storageService.addItem("tasks", task);
      }
      return task;
    } catch {
      return null;
    }
  }
}
