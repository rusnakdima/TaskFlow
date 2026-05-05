/* sys lib */
import { Injectable, inject } from "@angular/core";
import { ActivatedRouteSnapshot, Resolve, RouterStateSnapshot } from "@angular/router";
import { firstValueFrom, take } from "rxjs";

/* services */
import { DataService } from "@services/data/data.service";

/**
 * MainResolver - DataService First with Fallback Loading
 *
 * This resolver returns data from DataService.
 * If data is not found, it triggers a direct API call and waits.
 */
@Injectable({
  providedIn: "root",
})
export class MainResolver implements Resolve<any> {
  private dataService = inject(DataService);

  async resolve(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Promise<Object | string> {
    const paramsMap = route.paramMap;

    try {
      if (paramsMap.get("taskId")) {
        const taskId = paramsMap.get("taskId") ?? "";
        const todoId = paramsMap.get("todoId") ?? "";

        let todoFromStorage = await firstValueFrom(
          this.dataService.getTodo(todoId).pipe(take(1))
        ).catch(() => null);

        let taskFromStorage = await firstValueFrom(
          this.dataService.getTask(taskId).pipe(take(1))
        ).catch(() => null);

        if (todoFromStorage || taskFromStorage) {
          return { task: taskFromStorage || null, todo: todoFromStorage || null };
        }

        return { task: null, todo: null, error: "not_found" };
      } else if (paramsMap.get("todoId")) {
        const todoId = paramsMap.get("todoId") ?? "";

        let todoFromStorage = await firstValueFrom(
          this.dataService.getTodo(todoId).pipe(take(1))
        ).catch(() => null);

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
