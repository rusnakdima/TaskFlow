/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { ActivatedRoute, RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatExpansionModule } from "@angular/material/expansion";

/* models */
import { Response, ResponseStatus } from "@models/response";
import { Task } from "@models/task";
import { Todo } from "@models/todo";

/* services */
import { MainService } from "@services/main.service";
import { NotifyService } from "@services/notify.service";

/* components */
import { SearchComponent } from "@components/fields/search/search.component";
import { TaskComponent } from "@components/task/task.component";

@Component({
  selector: "app-tasks",
  standalone: true,
  providers: [MainService, NotifyService],
  imports: [CommonModule, MatIconModule, MatExpansionModule, RouterModule, SearchComponent, TaskComponent],
  templateUrl: "./tasks.component.html",
})
export class TasksComponent implements OnInit {
  constructor(
    private route: ActivatedRoute,
    private mainService: MainService,
    private notifyService: NotifyService
  ) {}

  listTasks: Array<Task> = [];
  tempListTasks: Array<Task> = [];

  todo: Todo | null = null;

  ngOnInit(): void {
    this.route.params.subscribe((params: any) => {
      if (params.todoId) {
        this.getTodoInfo(params.todoId);
        this.getTasksByTodoId(params.todoId);
      }
    });
  }

  getTodoInfo(id: string) {
    this.mainService
      .getByField<Todo>("todo", "id", id)
      .then((response: Response<Todo>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          this.todo = response.data;
        } else {
          this.notifyService.showNotify(response.status, response.message);
        }
      })
      .catch((err: Response<string>) => {
        this.notifyService.showError(err.message ?? err.toString());
      });
  }

  getTasksByTodoId(todoId: string) {
    this.mainService
      .getAllByField<Array<Task>>("task", "todoId", todoId)
      .then((response: Response<Array<Task>>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          this.listTasks = response.data;
          this.tempListTasks = response.data;
        } else {
          this.notifyService.showError(response.message);
        }
      })
      .catch((err: Response<string>) => {
        this.notifyService.showError(err.message);
      });
  }

  searchFunc(data: Array<any>) {
    this.listTasks = data;
  }
}
