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
import { StorageService } from "@services/core/storage.service";

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

    const isOwner = queryParams["isOwner"] !== "false";
    const isPrivate = queryParams["isPrivate"] !== "false";

    try {
      if (paramsMap.get("taskId")) {
        const taskId = paramsMap.get("taskId") ?? "";
        const todoId = paramsMap.get("todoId") ?? "";

        // First, try to get data from storage
        let taskFromStorage = this.storageService.getById("tasks", taskId);
        let todoFromStorage = this.storageService.getById("todos", todoId);

        // Wait for storage to be populated (max 2 seconds)
        let waitCount = 0;
        while ((!taskFromStorage || !todoFromStorage) && waitCount < 20) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          taskFromStorage = this.storageService.getById("tasks", taskId);
          todoFromStorage = this.storageService.getById("todos", todoId);
          waitCount++;
        }

        if (taskFromStorage && todoFromStorage) {
          return { task: taskFromStorage, todo: todoFromStorage };
        }

        // If not in storage after waiting, fetch from backend
        const taskObservable = this.dataSyncProvider.crud<Task>("get", "tasks", {
          filter: { id: taskId },
          isOwner,
          isPrivate,
        });
        const task: Task = await firstValueFrom(taskObservable);

        const todoObservable = this.dataSyncProvider.crud<Todo>("get", "todos", {
          filter: { id: todoId },
          isOwner,
          isPrivate,
          relations: RelationsHelper.getTodoRelations(),
        });
        const todo: Todo = await firstValueFrom(todoObservable);

        // Store in storage
        if (todo && todo.id) {
          const existingTodo = this.storageService.getById("todos", todoId);
          if (existingTodo) {
            this.storageService.updateItem("todos", todoId, todo);
          } else {
            this.storageService.addItem("todos", todo);
          }
        }

        return { task, todo };
      } else if (paramsMap.get("todoId")) {
        const todoId = paramsMap.get("todoId") ?? "";

        // First, try to get data from storage
        let todoFromStorage = this.storageService.getById("todos", todoId);

        // Wait for storage to be populated (max 2 seconds)
        let waitCount = 0;
        while (!todoFromStorage && waitCount < 20) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          todoFromStorage = this.storageService.getById("todos", todoId);
          waitCount++;
        }

        if (todoFromStorage) {
          return todoFromStorage;
        }

        // If not in storage after waiting, fetch from backend
        const todoObservable = this.dataSyncProvider.crud<Todo>("get", "todos", {
          filter: { id: todoId },
          isOwner,
          isPrivate,
          relations: RelationsHelper.getTodoRelationsWithUser(),
        });
        const todo: Todo = await firstValueFrom(todoObservable);

        // Store in storage
        if (todo && todo.id) {
          const existingTodo = this.storageService.getById("todos", todoId);
          if (existingTodo) {
            this.storageService.updateItem("todos", todoId, todo);
          } else {
            this.storageService.addItem("todos", todo);
          }
        }

        return todo;
      } else {
        return "";
      }
    } catch (err) {
      return "Error Resolving Data";
    }
  }
}
