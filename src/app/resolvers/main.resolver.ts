/* sys lib */
import { Injectable, inject } from "@angular/core";
import { ActivatedRouteSnapshot, Resolve, RouterStateSnapshot } from "@angular/router";
import { firstValueFrom, of, timeout, catchError } from "rxjs";

/* models */
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { TodoRelations } from "@models/relations.config";

/* services */
import { ApiProvider } from "@providers/api.provider";
import { StorageService } from "@services/core/storage.service";

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

        // If not in storage after waiting, fetch from backend with TIMEOUT
        const taskObservable = this.dataSyncProvider.crud<Task>("get", "tasks", {
          filter: { id: taskId },
          isOwner,
          isPrivate,
        });

        const todoObservable = this.dataSyncProvider.crud<Todo>("get", "todos", {
          filter: { id: todoId },
          isOwner,
          isPrivate,
          load: TodoRelations.tasks, // Load tasks with subtasks and comments
        });

        // ✅ Add timeout to prevent hanging on offline MongoDB queries
        const [task, todo] = await Promise.all([
          firstValueFrom(
            taskObservable.pipe(
              timeout(5000),
              catchError(() => of(null))
            )
          ),
          firstValueFrom(
            todoObservable.pipe(
              timeout(5000),
              catchError(() => of(null))
            )
          ),
        ]);

        if (!task || !todo) {
          console.warn("MainResolver: Failed to load task/todo from backend");
          // Return empty object instead of error string to prevent route failure
          return { task: null, todo: null, error: "offline" };
        }

        this.upsertTodo(todo, todoId);

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

        // If not in storage after waiting, fetch from backend with TIMEOUT
        const todoObservable = this.dataSyncProvider.crud<Todo>("get", "todos", {
          filter: { id: todoId },
          isOwner,
          isPrivate,
          load: TodoRelations.loadAll, // Load all relations including user
        });

        // ✅ Add timeout to prevent hanging on offline MongoDB queries
        const todo: Todo | null = await firstValueFrom(
          todoObservable.pipe(
            timeout(5000),
            catchError(() => of(null))
          )
        );

        if (!todo) {
          console.warn("MainResolver: Failed to load todo from backend");
          // Return empty object instead of error string
          return { id: todoId, error: "offline" };
        }

        this.upsertTodo(todo, todoId);

        return todo;
      } else {
        return "";
      }
    } catch (err) {
      console.error("MainResolver: Error resolving data:", err);
      // Return empty object instead of error string to prevent route failure
      return { error: "offline" };
    }
  }

  private upsertTodo(todo: Todo | null, todoId: string): void {
    if (!todo?.id) return;
    const existing = this.storageService.getById("todos", todoId);
    if (existing) {
      this.storageService.updateItem("todos", todoId, todo);
    } else {
      this.storageService.addItem("todos", todo);
    }
  }
}
