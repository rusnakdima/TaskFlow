/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal } from "@angular/core";
import { RouterModule } from "@angular/router";
import { CdkDragDrop, DragDropModule, moveItemInArray } from "@angular/cdk/drag-drop";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";

/* services */
import { AuthService } from "@services/auth.service";
import { NotifyService } from "@services/notify.service";
import { DataSyncProvider } from "@services/data-sync.provider";

/* components */
import { SearchComponent } from "@components/fields/search/search.component";
import { TodoComponent } from "@components/todo/todo.component";

@Component({
  selector: "app-todos",
  standalone: true,
  providers: [DataSyncProvider],
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
    private notifyService: NotifyService,
    private dataSyncProvider: DataSyncProvider
  ) {}

  listTodos = signal<Array<Todo>>([]);
  tempListTodos = signal<Array<Todo>>([]);

  private isUpdatingOrder: boolean = false;

  activeFilter = signal("all");
  showFilter = signal(false);

  userId = signal("");

  filterOptions = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "completed", label: "Completed" },
    { key: "week", label: "This Week" },
  ];

  ngOnInit(): void {
    this.userId.set(this.authService.getValueByKey("id"));
    this.loadTodos();
  }

  loadTodos(): void {
    if (this.userId() && this.userId() != "") {
      this.dataSyncProvider
        .getAll<Todo>("todo", { userId: this.userId() }, { isOwner: true, isPrivate: true })
        .subscribe({
          next: (todos) => {
            this.tempListTodos.set(todos);
            this.applyFilter();
          },
          error: (err) => {
            this.notifyService.showError(err.message || "Failed to load todos");
          },
        });
    }
  }

  searchFunc(data: Array<any>) {
    this.listTodos.set(data);
  }

  toggleFilter() {
    this.showFilter.update((val) => !val);
  }

  changeFilter(filter: string): void {
    this.activeFilter.set(filter);
    this.applyFilter();
  }

  applyFilter(): void {
    let filtered = [...this.tempListTodos()];

    switch (this.activeFilter()) {
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

    filtered.sort((a, b) => b.order - a.order);
    this.listTodos.set(filtered);
  }

  getFilteredCount(filter: string): number {
    switch (filter) {
      case "all":
        return this.tempListTodos().length;
      case "active":
        return this.tempListTodos().filter((todo) => !this.isCompleted(todo)).length;
      case "completed":
        return this.tempListTodos().filter((todo) => this.isCompleted(todo)).length;
      case "week":
        const todayForWeek = new Date();
        const dayOfWeek = todayForWeek.getDay();
        const startDateOfWeek = new Date(todayForWeek);
        startDateOfWeek.setDate(todayForWeek.getDate() - dayOfWeek);
        startDateOfWeek.setHours(0, 0, 0, 0);

        const endDateOfWeek = new Date(startDateOfWeek);
        endDateOfWeek.setDate(startDateOfWeek.getDate() + 6);
        endDateOfWeek.setHours(23, 59, 59, 999);

        return this.tempListTodos().filter((todo) => {
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
    this.dataSyncProvider.delete("todo", todoId, { isPrivate: true }).subscribe({
      next: (result) => {
        this.notifyService.showSuccess("Todo deleted successfully");
        this.loadTodos();
      },
      error: (err) => {
        this.notifyService.showError(err.message || "Failed to delete todo");
      },
    });
  }

  onTodoDrop(event: CdkDragDrop<Todo[]>): void {
    if (this.isUpdatingOrder) {
      this.notifyService.showWarning("Please wait for previous operation to complete");
      return;
    }

    moveItemInArray(this.listTodos(), event.previousIndex, event.currentIndex);
    this.updateTodoOrder();
  }

  updateTodoOrder(): void {
    this.isUpdatingOrder = true;

    this.listTodos().forEach((todo, index) => {
      todo.order = this.listTodos().length - 1 - index;
    });

    const transformedTodos = this.listTodos().map((todo) => ({
      _id: todo._id,
      id: todo.id,
      userId: todo.userId || "",
      title: todo.title,
      description: todo.description,
      startDate: todo.startDate,
      endDate: todo.endDate,
      categories: todo.categories?.map((cat) => cat.id) || [],
      assignees: todo.assignees?.map((assignee) => assignee.id) || [],
      visibility: todo.visibility,
      order: todo.order,
      isDeleted: todo.isDeleted,
      createdAt: todo.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString().split(".")[0],
    }));

    this.dataSyncProvider
      .updateAll<string>("todo", transformedTodos, { isPrivate: true })
      .subscribe({
        next: (result) => {
          this.notifyService.showSuccess("Order updated successfully");
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to update order");
          this.loadTodos();
        },
        complete: () => {
          this.isUpdatingOrder = false;
        },
      });
  }
}
