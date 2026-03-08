/* sys lib */
import { Injectable } from "@angular/core";
import { ActivatedRouteSnapshot, Resolve, RouterStateSnapshot } from "@angular/router";
import { firstValueFrom } from "rxjs";

/* models */
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";

/* helpers */
import { RelationsHelper } from "@helpers/relations.helper";

/* services */
import { DataSyncProvider } from "@providers/data-sync.provider";

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

    try {
      if (paramsMap.get("taskId")) {
        const taskId = paramsMap.get("taskId") ?? "";
        const todoId = paramsMap.get("todoId") ?? "";

        const taskObservable = this.dataSyncProvider.get<Task>(
          "tasks",
          { id: taskId },
          { isOwner: true, isPrivate: true }
        );

        const task = await firstValueFrom(taskObservable);

        const todoObservable = this.dataSyncProvider.get<Todo>(
          "todos",
          { id: todoId },
          { isOwner: true, isPrivate: true, relations: RelationsHelper.getTodoRelations() }
        );

        const todo = await firstValueFrom(todoObservable);

        return { task, todo };
      } else if (paramsMap.get("todoId")) {
        const todoId = paramsMap.get("todoId") ?? "";

        const todoObservable = this.dataSyncProvider.get<Todo>(
          "todos",
          { id: todoId },
          { isOwner: true, isPrivate: true, relations: RelationsHelper.getTodoRelations() }
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
