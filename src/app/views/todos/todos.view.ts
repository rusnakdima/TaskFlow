/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal, inject, computed } from "@angular/core";
import { RouterModule, ActivatedRoute } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { CdkDragDrop, DragDropModule } from "@angular/cdk/drag-drop";
import { HostListener } from "@angular/core";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";

/* helpers */
import { StateHelper } from "@helpers/state.helper";

/* services */
import { AuthService } from "@services/auth.service";
import { NotifyService } from "@services/notify.service";
import { FilterService } from "@services/filter.service";
import { SortService } from "@services/sort.service";
import { StorageService } from "@services/storage.service";
import { TemplateService } from "@services/template.service";
import { TodosBlueprintService } from "@services/todos-blueprint.service";
import { DragDropOrderService } from "@services/drag-drop-order.service";
import { DataSyncService } from "@services/data-sync.service";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

/* components */
import { TodoComponent } from "@components/todo/todo.component";
import { FilterBarComponent, FilterOption } from "@components/filter-bar/filter-bar.component";

@Component({
  selector: "app-todos",
  standalone: true,
  providers: [DataSyncProvider],
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatIconModule,
    TodoComponent,
    FilterBarComponent,
    DragDropModule,
  ],
  templateUrl: "./todos.view.html",
})
export class TodosView implements OnInit {
  // Services
  private filterService = inject(FilterService);
  private sortService = inject(SortService);
  public templateService = inject(TemplateService);
  public blueprintService = inject(TodosBlueprintService);
  private dragDropService = inject(DragDropOrderService);
  private stateHelper = inject(StateHelper);
  private route = inject(ActivatedRoute);
  private authService = inject(AuthService);
  private storageService = inject(StorageService);
  private notifyService = inject(NotifyService);
  private dataSyncProvider = inject(DataSyncProvider);
  private dataSyncService = inject(DataSyncService);

  // State
  todos = this.storageService.todos;
  activeFilter = signal("all");
  showFilter = signal(false);
  searchQuery = signal("");
  highlightTodoId = signal<string | null>(null);
  userId = signal("");

  // Computed signals
  listTodos = computed(() => {
    let filtered = this.todos().filter((todo) => todo.visibility === "private" && !todo.isDeleted);
    const filter = this.activeFilter();
    const query = this.searchQuery().toLowerCase().trim();

    switch (filter) {
      case "active":
        filtered = filtered.filter((todo) => !this.isCompleted(todo));
        break;
      case "completed":
        filtered = filtered.filter((todo) => this.isCompleted(todo));
        break;
      case "week":
        filtered = this.filterService.filterThisWeek(filtered);
        break;
      case "low":
      case "medium":
      case "high":
      case "urgent":
        filtered = this.filterService.filterByPriority(filtered, filter);
        break;
    }

    if (query) {
      filtered = filtered.filter(
        (todo) =>
          todo.title.toLowerCase().includes(query) || todo.description.toLowerCase().includes(query)
      );
    }

    return this.sortService.sortByOrder(filtered, "desc");
  });

  filterOptions: FilterOption[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "completed", label: "Completed" },
    { key: "week", label: "This Week" },
    { key: "low", label: "Low Priority" },
    { key: "medium", label: "Medium Priority" },
    { key: "high", label: "High Priority" },
    { key: "urgent", label: "Urgent Priority" },
  ];

  get filterOptionsWithCounts(): FilterOption[] {
    return this.filterOptions.map((option) => ({
      ...option,
      count: this.getFilteredCount(option.key),
    }));
  }

  ngOnInit(): void {
    this.userId.set(this.authService.getValueByKey("id"));

    // Handle highlight from query params
    this.route.queryParams.subscribe((queryParams: any) => {
      if (queryParams.highlightTodoId) {
        this.highlightTodoId.set(queryParams.highlightTodoId);
        setTimeout(() => {
          const element = document.getElementById("todo-" + queryParams.highlightTodoId);
          if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "center" });
            element.classList.add("ring-4", "ring-blue-500", "animate-pulse");
            setTimeout(() => {
              element.classList.remove("ring-4", "ring-blue-500", "animate-pulse");
            }, 2000);
          }
          this.highlightTodoId.set(null);
        }, 500);
      }
    });

    document.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "/" && document.activeElement?.tagName !== "INPUT") {
        event.preventDefault();
        this.showFilter.set(true);
        setTimeout(() => {
          const searchField = document.getElementById("searchField");
          if (searchField) searchField.focus();
        }, 100);
      }
    });
  }

  @HostListener("window:keydown", ["$event"])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (event.ctrlKey && event.key === "f") {
      event.preventDefault();
      this.toggleFilter();
    }
    if (event.ctrlKey && event.key === "r") {
      event.preventDefault();
      this.dataSyncService.loadAllData(true).subscribe();
    }
  }

  toggleFilter() {
    this.showFilter.update((val) => !val);
  }

  onFilterChange(filter: string) {
    this.activeFilter.set(filter);
  }

  onSearchChange(query: string) {
    this.searchQuery.set(query);
  }

  onSearchResults(results: any[]) {
    // Reactive via listTodos
  }

  clearFilters() {
    this.activeFilter.set("all");
    this.searchQuery.set("");
  }

  getFilteredCount(filter: string): number {
    const todos = this.todos().filter((todo) => todo.visibility === "private" && !todo.isDeleted);

    switch (filter) {
      case "all":
        return todos.length;
      case "active":
        return todos.filter((todo) => !this.isCompleted(todo)).length;
      case "completed":
        return todos.filter((todo) => this.isCompleted(todo)).length;
      case "week":
        return this.filterService.filterThisWeek(todos).length;
      case "low":
      case "medium":
      case "high":
      case "urgent":
        return this.filterService.filterByPriority(todos, filter).length;
      default:
        return 0;
    }
  }

  deleteTodoById(todoId: string): void {
    if (confirm("Are you sure you want to delete this project?")) {
      const todoToDelete = this.storageService.getTodoById(todoId);
      if (todoToDelete) {
        this.stateHelper.deleteOptimistically("todo", todoId, todoToDelete);
        this.notifyService.showSuccess("Todo deleted successfully");
      }
    }
  }

  onTodoDrop(event: CdkDragDrop<Todo[]>): void {
    this.dragDropService
      .handleDrop(event, this.listTodos(), "todo", "todos", undefined, {
        isOwner: true,
        isPrivate: true,
      })
      .subscribe();
  }

  // Blueprint logic delegated to service
  saveAsBlueprint(todo: Todo) {
    this.blueprintService.saveAsBlueprint(todo);
  }

  confirmSaveAsBlueprint() {
    this.blueprintService.confirmSaveAsBlueprint();
  }

  closeCreateBlueprintDialog() {
    this.blueprintService.closeCreateBlueprintDialog();
  }

  confirmCreateFromBlueprint() {
    this.blueprintService.confirmCreateFromBlueprint(this.userId()).subscribe();
  }

  openApplyBlueprint(template: any) {
    this.blueprintService.openApplyBlueprint(template);
  }

  removeBlueprint(templateId: string) {
    this.blueprintService.removeBlueprint(templateId);
  }

  getSubtasksCount(template: any): number {
    return this.blueprintService.getSubtasksCount(template);
  }

  /**
   * Check if todo is completed
   */
  isCompleted(todo: Todo): boolean {
    const listTasks = todo?.tasks ?? [];
    if (listTasks.length === 0) return false;
    const listCompletedTasks = listTasks.filter(
      (task: Task) => task.status === TaskStatus.COMPLETED || task.status === TaskStatus.SKIPPED
    );
    return listCompletedTasks.length === listTasks.length;
  }
}
