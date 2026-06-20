/* sys lib */
import { Injectable, inject } from "@angular/core";
import { ActivatedRouteSnapshot, Resolve, RouterStateSnapshot } from "@angular/router";
import { firstValueFrom, take } from "rxjs";
/* services */
import { ApiService } from "@services/api.service";
import { CrudOptions } from "@entities/api.model";
import { StorageService } from "@services/storage.service";
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
  private requestService = inject(ApiService);
  private apiService = inject(ApiService);
  private storageService = inject(StorageService);
  async resolve(
    route: ActivatedRouteSnapshot,
    _state: RouterStateSnapshot
  ): Promise<Object | string> {
    const paramsMap = route.paramMap;
    try {
      const visibility = route.queryParamMap.get("visibility") || "private";
      const options: CrudOptions = { visibility };
      if (paramsMap.get("taskId")) {
        const taskId = paramsMap.get("taskId") ?? "";
        const todoId = paramsMap.get("todoId") ?? "";
        const todos = this.storageService.todos();
        const tasks = this.storageService.tasks();
        let todoFromStorage = todos.find((t) => t.id === todoId) || null;
        let taskFromStorage = tasks.find((t) => t.id === taskId) || null;
        if (todoFromStorage || taskFromStorage) {
          if (!todoFromStorage) {
            this.requestService
              .get("todos", todoId, options)
              .pipe(take(1))
              .subscribe((todo) => {
                if (todo) this.storageService.modify("todos", "create", todo as any);
              });
          }
          if (!taskFromStorage) {
            this.requestService
              .get("tasks", taskId, options)
              .pipe(take(1))
              .subscribe((task) => {
                if (task) this.storageService.modify("tasks", "create", task as any);
              });
          }
          return { task: taskFromStorage, todo: todoFromStorage };
        }
        let todoFromApi = await firstValueFrom(
          this.apiService.todos.get(todoId, visibility).pipe(take(1))
        ).catch(() => null);
        let taskFromApi = await firstValueFrom(
          this.apiService.tasks.get(taskId, visibility).pipe(take(1))
        ).catch(() => null);
        if (todoFromApi) {
          this.storageService.modify("todos", "create", todoFromApi as any);
        }
        if (taskFromApi) {
          this.storageService.modify("tasks", "create", taskFromApi as any);
        }
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
          this.apiService.todos.get(todoId, visibility).pipe(take(1))
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
