/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Response, ResponseStatus } from "@models/response";
import { Todo } from "@models/todo";

/* services */
import { MainService } from "@services/main.service";
import { NotifyService } from "@services/notify.service";

/* components */
import { SearchComponent } from "@components/fields/search/search.component";
import { TodoComponent } from "@components/todo/todo.component";

@Component({
  selector: "app-todos",
  standalone: true,
  providers: [MainService, NotifyService],
  imports: [CommonModule, RouterModule, MatIconModule, SearchComponent, TodoComponent],
  templateUrl: "./todos.component.html",
})
export class TodosComponent implements OnInit {
  constructor(
    private mainService: MainService,
    private notifyService: NotifyService
  ) {}

  listTodos: Array<Todo> = [];
  tempListTodos: Array<Todo> = [];

  ngOnInit(): void {
    this.mainService
      .getAll<Array<Todo>>("todo")
      .then((response: Response<Array<Todo>>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          this.listTodos = response.data;
          this.tempListTodos = response.data;
        } else {
          this.notifyService.showError(response.message);
        }
      })
      .catch((err: Response<string>) => {
        this.notifyService.showError(err.message);
      });
  }

  searchFunc(data: Array<any>) {
    this.tempListTodos = data;
  }
}
