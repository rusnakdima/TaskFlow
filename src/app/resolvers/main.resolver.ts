/* sys lib */
import { Injectable, inject } from "@angular/core";
import { ActivatedRouteSnapshot, Resolve, RouterStateSnapshot } from "@angular/router";

/* services */
import { StorageService } from "@services/core/storage.service";

/**
 * MainResolver - Simple Storage-Only Resolver
 *
 * This resolver returns data ONLY from StorageService.
 * Data is pre-loaded at app init via DataLoaderService.
 * NO API calls are made here.
 *
 * If data is not found in storage, components will show "not found" message.
 */
@Injectable({
  providedIn: "root",
})
export class MainResolver implements Resolve<any> {
  private storageService = inject(StorageService);

  async resolve(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Promise<Object | string> {
    const paramsMap = route.paramMap;

    try {
      if (paramsMap.get("taskId")) {
        const taskId = paramsMap.get("taskId") ?? "";
        const todoId = paramsMap.get("todoId") ?? "";

        const taskFromStorage = this.storageService.getById("tasks", taskId);
        const todoFromStorage = this.storageService.getById("todos", todoId);

        if (taskFromStorage || todoFromStorage) {
          return { task: taskFromStorage || null, todo: todoFromStorage || null };
        }

        return { task: null, todo: null, error: "not_found" };
      } else if (paramsMap.get("todoId")) {
        const todoId = paramsMap.get("todoId") ?? "";

        const todoFromStorage = this.storageService.getById("todos", todoId);

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
}
