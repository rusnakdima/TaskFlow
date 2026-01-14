/* sys lib */
import { Injectable } from "@angular/core";
import { ActivatedRouteSnapshot, Resolve, RouterStateSnapshot } from "@angular/router";
import { firstValueFrom } from "rxjs";

/* models */
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";

/* services */
import { DataSyncProvider } from "./data-sync.provider";

@Injectable({
  providedIn: "root",
})
export class MainResolver implements Resolve<any> {
  constructor(private dataSyncProvider: DataSyncProvider) {}

  async resolve(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Promise<Object | string> {
    const paramsMap = route.paramMap;
    const queryParams = route.queryParams;

    try {
      if (paramsMap.get("taskId")) {
        const taskId = paramsMap.get("taskId") ?? "";
        const isPrivate = queryParams?.["isPrivate"] === "true";

        const taskObservable = this.dataSyncProvider.get<Task>(
          "task",
          { id: taskId },
          { isOwner: false, isPrivate }
        );

        const task = await firstValueFrom(taskObservable);
        return task;
      } else if (paramsMap.get("todoId")) {
        const todoId = paramsMap.get("todoId") ?? "";
        const isPrivate = queryParams?.["isPrivate"] === "true";

        const todoObservable = this.dataSyncProvider.get<Todo>(
          "todo",
          { id: todoId },
          { isOwner: true, isPrivate }
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
