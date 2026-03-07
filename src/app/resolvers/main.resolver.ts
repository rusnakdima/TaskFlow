/* sys lib */
import { Injectable } from "@angular/core";
import { ActivatedRouteSnapshot, Resolve, RouterStateSnapshot } from "@angular/router";
import { firstValueFrom } from "rxjs";

/* models */
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { RelationObj, TypesField } from "@models/relation-obj.model";

/* services */
import { DataSyncProvider } from "../providers/data-sync.provider";

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

    const todoRelations: RelationObj[] = [
      {
        nameTable: "tasks",
        typeField: TypesField.OneToMany,
        nameField: "todoId",
        newNameField: "tasks",
        relations: [
          {
            nameTable: "subtasks",
            typeField: TypesField.OneToMany,
            nameField: "taskId",
            newNameField: "subtasks",
            relations: null,
          },
        ],
      },
      {
        nameTable: "categories",
        typeField: TypesField.ManyToOne,
        nameField: "categories",
        newNameField: "categories",
        relations: null,
      },
    ];

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
          { isOwner: true, isPrivate: true, relations: todoRelations }
        );

        const todo = await firstValueFrom(todoObservable);

        return { task, todo };
      } else if (paramsMap.get("todoId")) {
        const todoId = paramsMap.get("todoId") ?? "";

        const todoObservable = this.dataSyncProvider.get<Todo>(
          "todos",
          { id: todoId },
          { isOwner: true, isPrivate: true, relations: todoRelations }
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
