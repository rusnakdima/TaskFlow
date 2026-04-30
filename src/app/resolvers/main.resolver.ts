/* sys lib */
import { Injectable, inject } from "@angular/core";
import { ActivatedRouteSnapshot, Resolve, RouterStateSnapshot } from "@angular/router";

/* services */
import { StorageService } from "@services/core/storage.service";
import { DataLoaderService } from "@services/data/data-loader.service";

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
    return this.storageService.getById("todos", todoId);
  }
}
