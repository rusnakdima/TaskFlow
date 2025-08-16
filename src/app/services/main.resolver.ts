/* sys lib */
import { Injectable } from "@angular/core";
import { ActivatedRouteSnapshot, Resolve, RouterStateSnapshot } from "@angular/router";
import { Observable, of } from "rxjs";
import { MainService } from "./main.service";
import { Response, ResponseStatus } from "@models/response";
import { Todo } from "@models/todo";
import { Task } from "@models/task";

@Injectable({
  providedIn: "root",
})
export class MainResolver implements Resolve<any> {
  constructor(private mainService: MainService) {}

  async resolve(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Promise<Object | string> {
    const paramsMap = route.paramMap;

    try {
      if (paramsMap.get("taskId")) {
        const taskId = paramsMap.get("taskId") ?? "";
        const response: Response<Task> = await this.mainService.getByField<Task>(
          "task",
          "id",
          taskId
        );

        if (response.status === ResponseStatus.SUCCESS) {
          return response.data;
        } else {
          return "Task Not Found";
        }
      } else if (paramsMap.get("todoId")) {
        const todoId = paramsMap.get("todoId") ?? "";
        const response: Response<Todo> = await this.mainService.getByField<Todo>(
          "todo",
          "id",
          todoId
        );

        if (response.status === ResponseStatus.SUCCESS) {
          return response.data;
        } else {
          return "Todo Not Found";
        }
      } else {
        return "";
      }
    } catch (err) {
      console.error("Error in resolver:", err);
      return "Error Resolving Data";
    }
  }
}
