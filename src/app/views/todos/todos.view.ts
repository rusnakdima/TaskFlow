/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal } from "@angular/core";
import { RouterModule } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { CdkDragDrop, DragDropModule, moveItemInArray } from "@angular/cdk/drag-drop";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";

/* services */
import { AuthService } from "@services/auth.service";
import { NotifyService } from "@services/notify.service";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

/* components */
import { SearchComponent } from "@components/fields/search/search.component";
import { TodoComponent } from "@components/todo/todo.component";

interface SavedFilter {
  id: string;
  name: string;
  filter: string;
  searchQuery?: string;
  createdAt: string;
}

@Component({
  selector: "app-todos",
  standalone: true,
  providers: [DataSyncProvider],
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
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
  searchQuery = signal("");

  userId = signal("");

  savedFilters = signal<SavedFilter[]>([]);
  showSaveFilterDialog = signal(false);
  newFilterName = signal("");

  filterOptions = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "completed", label: "Completed" },
    { key: "week", label: "This Week" },
  ];

  ngOnInit(): void {
    this.userId.set(this.authService.getValueByKey("id"));
    this.loadSavedFilters();
    this.loadTodos();
  }

  loadSavedFilters(): void {
    const stored = localStorage.getItem("savedFilters");
    if (stored) {
      this.savedFilters.set(JSON.parse(stored));
    }
  }

  private saveFiltersToStorage(): void {
    localStorage.setItem("savedFilters", JSON.stringify(this.savedFilters()));
  }

  loadTodos(): void {
    if (this.userId() && this.userId() != "") {
      this.dataSyncProvider
        .getAll<Todo>(
          "todo",
          { userId: this.userId(), visibility: "private" },
          { isOwner: true, isPrivate: true }
        )
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

  onSearchChange(query: string): void {
    this.searchQuery.set(query);
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
    this.dataSyncProvider.delete("todo", todoId, { isOwner: true, isPrivate: true }).subscribe({
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
      .updateAll<string>("todo", transformedTodos, { isOwner: true, isPrivate: true })
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

  openSaveFilterDialog(): void {
    this.showSaveFilterDialog.set(true);
    this.newFilterName.set("");
  }

  closeSaveFilterDialog(): void {
    this.showSaveFilterDialog.set(false);
    this.newFilterName.set("");
  }

  saveCurrentFilter(): void {
    const name = this.newFilterName().trim();
    if (!name) {
      this.notifyService.showWarning("Please enter a filter name");
      return;
    }

    const newFilter: SavedFilter = {
      id: Date.now().toString(),
      name,
      filter: this.activeFilter(),
      searchQuery: this.searchQuery(),
      createdAt: new Date().toISOString(),
    };

    this.savedFilters.update((filters) => [...filters, newFilter]);
    this.saveFiltersToStorage();
    this.notifyService.showSuccess("Filter saved successfully");
    this.closeSaveFilterDialog();
  }

  applySavedFilter(savedFilter: SavedFilter): void {
    this.activeFilter.set(savedFilter.filter);
    this.searchQuery.set(savedFilter.searchQuery || "");
    this.applyFilter();
    this.showFilter.set(true);
  }

  deleteSavedFilter(filterId: string): void {
    this.savedFilters.update((filters) => filters.filter((f) => f.id !== filterId));
    this.saveFiltersToStorage();
    this.notifyService.showSuccess("Filter deleted");
  }
}
