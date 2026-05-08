/* sys lib */
import { Injectable, inject } from "@angular/core";
import { ActivatedRouteSnapshot, Resolve, RouterStateSnapshot } from "@angular/router";
import { firstValueFrom, take } from "rxjs";

/* services */
import { REQUEST_SERVICE } from "@services/api.service";
import { STORAGE_SERVICE, StorageService } from "@services/storage.service";

/**
 * MainResolver - Storage First with API Fallback
 *
 * This resolver checks storage first before making API calls.
 * Only fetches from API if data is not found in storage.
 */
@Injectable({
  providedIn: "root",
})
export class MainResolver implements Resolve<any> {
  private requestService = inject(REQUEST_SERVICE);
  private storageService = inject(STORAGE_SERVICE);

  async resolve(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Promise<Object | string> {
    const paramsMap = route.paramMap;

    try {
      if (paramsMap.get("taskId")) {
        const taskId = paramsMap.get("taskId") ?? "";
        const todoId = paramsMap.get("todoId") ?? "";

        const todos = this.storageService.todos();
        const tasks = this.storageService.tasks();

        let todoFromStorage = todos.find((t) => t.id === todoId) || null;
        let taskFromStorage = tasks.find((t) => t.id === taskId) || null;

        if (todoFromStorage || taskFromStorage) {
          return { task: taskFromStorage, todo: todoFromStorage };
        }

        let todoFromApi = await firstValueFrom(
          this.requestService.getTodo(todoId).pipe(take(1))
        ).catch(() => null);

        let taskFromApi = await firstValueFrom(
          this.requestService.getTask(taskId).pipe(take(1))
        ).catch(() => null);

        if (todoFromApi || taskFromApi) {
          return { task: taskFromApi || null, todo: todoFromApi || null };
        }

        return { task: null, todo: null, error: "not_found" };
      } else if (paramsMap.get("todoId")) {
        const todoId = paramsMap.get("todoId") ?? "";

        const todos = this.storageService.todos();
        let todoFromStorage = todos.find((t) => t.id === todoId) || null;

        if (todoFromStorage) {
          return todoFromStorage;
        }

        let todoFromApi = await firstValueFrom(
          this.requestService.getTodo(todoId).pipe(take(1))
        ).catch(() => null);

        if (todoFromApi) {
          return todoFromApi;
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
