/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { RouterModule } from "@angular/router";
import { CdkDragDrop, DragDropModule, moveItemInArray } from "@angular/cdk/drag-drop";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Response, ResponseStatus } from "@models/response";
import { Todo } from "@models/todo";
import { Task, TaskStatus } from "@models/task";

/* services */
import { AuthService } from "@services/auth.service";
import { MainService } from "@services/main.service";
import { NotifyService } from "@services/notify.service";

/* components */
import { SearchComponent } from "@components/fields/search/search.component";
import { TodoComponent } from "@components/todo/todo.component";

@Component({
  selector: "app-todos",
  standalone: true,
  providers: [MainService],
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    SearchComponent,
    TodoComponent,
    DragDropModule,
  ],
  templateUrl: "./todos.view.html",
})
export class TodosView implements OnInit {
  constructor(
    private authService: AuthService,
    private mainService: MainService,
    private notifyService: NotifyService
  ) {}

  listTodos: Array<Todo> = [];
  tempListTodos: Array<Todo> = [];

  private isUpdatingOrder: boolean = false;

  activeFilter: string = "all";
  showFilter: boolean = false;

  userId: string = "";

  filterOptions = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "completed", label: "Completed" },
    { key: "week", label: "This Week" },
  ];

  ngOnInit(): void {
    this.userId = this.authService.getValueByKey("id");
    this.loadTodos();
  }

  loadTodos(): void {
    if (this.userId && this.userId != "") {
      this.mainService
        .getAllByField<Array<Todo>>("todo", "userId", this.userId)
        .then((response: Response<Array<Todo>>) => {
          if (response.status === ResponseStatus.SUCCESS) {
            this.tempListTodos = response.data;
            this.applyFilter();
          } else {
            this.notifyService.showError(response.message);
          }
        })
        .catch((err: Response<string>) => {
          this.notifyService.showError(err.message);
        });
    }
  }

  searchFunc(data: Array<any>) {
    this.listTodos = data;
  }

  toggleFilter() {
    this.showFilter = !this.showFilter;
  }

  changeFilter(filter: string): void {
    this.activeFilter = filter;
    this.applyFilter();
  }

  applyFilter(): void {
    let filtered = [...this.tempListTodos];

    switch (this.activeFilter) {
      case "active":
        filtered = filtered.filter((todo) => !this.isCompleted(todo));
        break;
      case "completed":
        filtered = filtered.filter((todo) => this.isCompleted(todo));
        break;
      case "week":
        const todayForWeek = new Date();
        const dayOfWeek = todayForWeek.getDay();
        const startDateOfWeek = new Date(todayForWeek);
        startDateOfWeek.setDate(todayForWeek.getDate() - dayOfWeek);
        startDateOfWeek.setHours(0, 0, 0, 0);

        const endDateOfWeek = new Date(startDateOfWeek);
        endDateOfWeek.setDate(startDateOfWeek.getDate() + 6);
        endDateOfWeek.setHours(23, 59, 59, 999);

        filtered = filtered.filter((todo) => {
          if (todo.startDate && todo.endDate) {
            const todoStartDate = new Date(todo.startDate);
            const todoEndDate = new Date(todo.endDate);
            return todoStartDate <= endDateOfWeek && todoEndDate >= startDateOfWeek;
          }
          return false;
        });
        break;
      default:
        break;
    }

    this.listTodos = filtered;
  }

  getFilteredCount(filter: string): number {
    switch (filter) {
      case "all":
        return this.tempListTodos.length;
      case "active":
        return this.tempListTodos.filter((todo) => !this.isCompleted(todo)).length;
      case "completed":
        return this.tempListTodos.filter((todo) => this.isCompleted(todo)).length;
      case "week":
        const todayForWeek = new Date();
        const dayOfWeek = todayForWeek.getDay();
        const startDateOfWeek = new Date(todayForWeek);
        startDateOfWeek.setDate(todayForWeek.getDate() - dayOfWeek);
        startDateOfWeek.setHours(0, 0, 0, 0);

        const endDateOfWeek = new Date(startDateOfWeek);
        endDateOfWeek.setDate(startDateOfWeek.getDate() + 6);
        endDateOfWeek.setHours(23, 59, 59, 999);

        return this.tempListTodos.filter((todo) => {
          if (todo.startDate && todo.endDate) {
            const todoStartDate = new Date(todo.startDate);
            const todoEndDate = new Date(todo.endDate);
            return todoStartDate <= endDateOfWeek && todoEndDate >= startDateOfWeek;
          }
          return false;
        }).length;
      default:
        return 0;
    }
  }

  isCompleted(todo: Todo): boolean {
    const listTasks = todo?.tasks ?? [];
    const listCompletedTasks = listTasks.filter(
      (task: Task) => task.status === TaskStatus.COMPLETED || task.status === TaskStatus.SKIPPED
    );
    return listCompletedTasks.length == listTasks.length;
  }

  deleteTodoById(todoId: string): void {
    this.mainService
      .delete<string>("todo", todoId)
      .then((response: Response<string>) => {
        this.notifyService.showNotify(response.status, response.message);
        if (response.status === ResponseStatus.SUCCESS) {
          this.loadTodos();
        }
      })
      .catch((err: Response<string>) => {
        this.notifyService.showError(err.message);
      });
  }

  onTodoDrop(event: CdkDragDrop<Todo[]>): void {
    if (this.isUpdatingOrder) {
      this.notifyService.showWarning("Please wait for previous operation to complete");
      return;
    }

    moveItemInArray(this.listTodos, event.previousIndex, event.currentIndex);
    this.updateTodoOrder();
  }

  updateTodoOrder(): void {
    this.isUpdatingOrder = true;

    this.listTodos.forEach((todo, index) => {
      todo.order = index;
    });

    const transformedTodos = this.listTodos.map((todo) => ({
      _id: todo._id,
      id: todo.id,
      userId: todo.userId || "",
      title: todo.title,
      description: todo.description,
      startDate: todo.startDate,
      endDate: todo.endDate,
      categories: todo.categories?.map((cat) => cat.id) || [],
      assignees: todo.assignees?.map((assignee) => assignee.id) || [],
      order: todo.order,
      isDeleted: todo.isDeleted,
      createdAt: todo.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString().split(".")[0],
    }));

    this.mainService
      .updateAll<string, any>("todo", transformedTodos)
      .then((response: Response<string>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          this.notifyService.showNotify(ResponseStatus.SUCCESS, "Order updated successfully");
        } else {
          this.loadTodos();
          this.notifyService.showError("Failed to update order");
        }
      })
      .catch((err: Response<string>) => {
        this.notifyService.showError("Failed to update order");
        this.loadTodos();
        console.error(err);
      })
      .finally(() => {
        this.isUpdatingOrder = false;
      });
  }
}
