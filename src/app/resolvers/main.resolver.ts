/* sys lib */
import { Injectable, inject } from "@angular/core";
import { ActivatedRouteSnapshot, Resolve, RouterStateSnapshot } from "@angular/router";
import { firstValueFrom } from "rxjs";

/* models */
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";

/* helpers */
import { RelationsHelper } from "@helpers/relations.helper";

/* services */
import { DataSyncProvider } from "@providers/data-sync.provider";
import { StorageService } from "@services/storage.service";

@Injectable({
  providedIn: "root",
})
export class MainResolver implements Resolve<any> {
  private dataSyncProvider = inject(DataSyncProvider);
  private storageService = inject(StorageService);

  async resolve(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Promise<Object | string> {
    const paramsMap = route.paramMap;
    const queryParams = route.queryParams;

    // Read isOwner and isPrivate from query params (default to true for backward compatibility)
    const isOwner = queryParams["isOwner"] !== "false";
    const isPrivate = queryParams["isPrivate"] !== "false";

    try {
      if (paramsMap.get("taskId")) {
        const taskId = paramsMap.get("taskId") ?? "";
        const todoId = paramsMap.get("todoId") ?? "";

        // First, try to get data from storage (already loaded)
        const taskFromStorage = this.storageService.getTaskById(taskId);
        const todoFromStorage = this.storageService.getTodoById(todoId);

        if (taskFromStorage && todoFromStorage) {
          return { task: taskFromStorage, todo: todoFromStorage };
        }

        // If not in storage, fetch from backend
        const taskObservable = this.dataSyncProvider.get<Task>(
          "tasks",
          { id: taskId },
          { isOwner, isPrivate }
        );

        const task = await firstValueFrom(taskObservable);

        const todoObservable = this.dataSyncProvider.get<Todo>(
          "todos",
          { id: todoId },
          { isOwner, isPrivate, relations: RelationsHelper.getTodoRelations() }
        );

        const todo = await firstValueFrom(todoObservable);

        return { task, todo };
      } else if (paramsMap.get("todoId")) {
        const todoId = paramsMap.get("todoId") ?? "";

        // First, try to get data from storage (already loaded)
        const todoFromStorage = this.storageService.getTodoById(todoId);

        if (todoFromStorage) {
          return todoFromStorage;
        }

        // If not in storage, fetch from backend
        const todoObservable = this.dataSyncProvider.get<Todo>(
          "todos",
          { id: todoId },
          { isOwner, isPrivate, relations: RelationsHelper.getTodoRelations() }
        );

        const todo = await firstValueFrom(todoObservable);
        return todo;
      } else {
        return "";
      }
    } catch (err) {
      console.error("Error in resolver:", err);
      return "Error Resolving Data";
    }
  }
}
