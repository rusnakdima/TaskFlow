/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal, inject } from "@angular/core";
import { RouterModule } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { CdkDragDrop, DragDropModule, moveItemInArray } from "@angular/cdk/drag-drop";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Todo } from "@models/todo.model";
import { TaskStatus } from "@models/task.model";

/* services */
import { AuthService } from "@services/auth.service";
import { NotifyService } from "@services/notify.service";
import { FilterService } from "@services/filter.service";
import { SortService } from "@services/sort.service";
import { StorageService } from "@services/storage.service";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

/* components */
import { TodoComponent } from "@components/todo/todo.component";
import { FilterBarComponent, FilterOption } from "@components/filter-bar/filter-bar.component";

/* controllers */
import { TodosController } from "@controllers/todos.controller";

@Component({
  selector: "app-todos",
  standalone: true,
  providers: [DataSyncProvider, TodosController],
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
  private controller = inject(TodosController);
  private filterService = inject(FilterService);
  private sortService = inject(SortService);

  constructor(
    private authService: AuthService,
    private storageService: StorageService,
    private notifyService: NotifyService
  ) {}

  // Expose templateService for template
  get templateService() {
    return this.controller.templateService;
  }

  // Use storage signals directly for source data
  todos = this.storageService.todos;

  // Separate signal for filtered/sorted display list
  listTodos = signal<Todo[]>([]);

  private isUpdatingOrder: boolean = false;

  activeFilter = signal("all");
  showFilter = signal(false);
  searchQuery = signal("");

  userId = signal("");

  filterOptions: FilterOption[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "completed", label: "Completed" },
    { key: "week", label: "This Week" },
  ];

  get filterOptionsWithCounts(): FilterOption[] {
    return this.filterOptions.map((option) => ({
      ...option,
      count: this.getFilteredCount(option.key),
    }));
  }

  // Blueprint dialog state
  showBlueprintDialog = signal(false);
  showCreateBlueprintDialog = signal(false);
  blueprintToSave = signal<Todo | null>(null);
  newBlueprintName = signal("");
  newBlueprintDescription = signal("");

  showApplyBlueprintDialog = signal(false);
  blueprintToApply = signal<any | null>(null);
  applyBlueprintTitle = signal("");

  ngOnInit(): void {
    this.userId.set(this.authService.getValueByKey("id"));
    this.controller.init(this.userId());

    // Load data once on init
    this.storageService.loadAllData().subscribe({
      next: () => {
        // Apply initial filter after data is loaded
        this.applyFilter();
      },
      error: (err) => {
        this.notifyService.showError(err.message || "Failed to load todos");
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

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  changeFilter(filter: string) {
    this.activeFilter.set(filter);
    this.applyFilter();
  }

  onFilterChange(filter: string) {
    // This is called when filter radio button changes
    this.activeFilter.set(filter);
    this.applyFilter();
  }

  onSearchChange(query: string) {
    // This is called when search input changes
    this.searchQuery.set(query);
    // Re-apply filter with new search query
    this.applyFilter();
  }

  toggleFilter() {
    this.showFilter.update((val) => !val);
  }

  onSearchResults(results: any[]) {
    // Search results come from the search component
    // We need to apply the current filter on top of search results
    if (this.searchQuery()) {
      // Apply the active filter to search results
      let filtered = [...results];

      switch (this.activeFilter()) {
        case "active":
          filtered = filtered.filter((todo) => !this.controller.isCompleted(todo));
          break;
        case "completed":
          filtered = filtered.filter((todo) => this.controller.isCompleted(todo));
          break;
        case "week":
          filtered = this.filterService.filterThisWeek(filtered);
          break;
      }

      filtered = this.sortService.sortByOrder(filtered, "desc");
      this.listTodos.set(filtered);
    } else {
      // No search query, just apply normal filter
      this.applyFilter();
    }
  }

  clearFilters() {
    this.activeFilter.set('all');
    this.searchQuery.set('');
    this.applyFilter();
  }

  applyFilter(): void {
    let filtered = [...this.todos()];

    switch (this.activeFilter()) {
      case "active":
        filtered = filtered.filter((todo) => !this.controller.isCompleted(todo));
        break;
      case "completed":
        filtered = filtered.filter((todo) => this.controller.isCompleted(todo));
        break;
      case "week":
        filtered = this.filterService.filterThisWeek(filtered);
        break;
    }

    // Apply search filter
    if (this.searchQuery()) {
      const query = this.searchQuery().toLowerCase();
      filtered = filtered.filter((todo) =>
        todo.title.toLowerCase().includes(query) ||
        todo.description.toLowerCase().includes(query)
      );
    }

    filtered = this.sortService.sortByOrder(filtered, "desc");
    this.listTodos.set(filtered);
  }

  getFilteredCount(filter: string): number {
    const todos = this.todos();

    switch (filter) {
      case "all":
        return todos.length;
      case "active":
        return todos.filter((todo) => !this.controller.isCompleted(todo)).length;
      case "completed":
        return todos.filter((todo) => this.controller.isCompleted(todo)).length;
      case "week":
        return this.filterService.filterThisWeek(todos).length;
      default:
        return 0;
    }
  }

  deleteTodoById(todoId: string): void {
    this.controller.deleteTodoById(todoId, () => {
      // Re-apply filter to update the list after deletion
      this.applyFilter();
    });
  }

  onTodoDrop(event: CdkDragDrop<Todo[]>): void {
    if (this.isUpdatingOrder) {
      this.notifyService.showWarning("Please wait for previous operation to complete");
      return;
    }

    if (event.previousIndex !== event.currentIndex) {
      const todos = this.listTodos();
      const prevTodo = todos[event.previousIndex];
      const currentTodo = todos[event.currentIndex];

      const tempOrder = prevTodo.order;
      prevTodo.order = currentTodo.order;
      currentTodo.order = tempOrder;

      moveItemInArray(todos, event.previousIndex, event.currentIndex);
      this.controller.updateTwoTodoOrder(prevTodo, currentTodo, () => {
        this.isUpdatingOrder = false;
      });
      this.isUpdatingOrder = true;
    }
  }

  updateTodoOrder(): void {
    this.isUpdatingOrder = true;
    this.controller.updateTodoOrder(this.listTodos(), (success) => {
      this.isUpdatingOrder = false;
    });
  }

  // Blueprint methods
  saveAsBlueprint(todo: Todo) {
    this.blueprintToSave.set(todo);
    this.newBlueprintName.set(`${todo.title} Blueprint`);
    this.newBlueprintDescription.set(todo.description || "");
    this.showCreateBlueprintDialog.set(true);
  }

  confirmSaveAsBlueprint() {
    const todo = this.blueprintToSave();
    const name = this.newBlueprintName();
    const description = this.newBlueprintDescription();

    if (todo && name) {
      this.controller.saveAsBlueprint(todo, name, description, () => {
        this.closeCreateBlueprintDialog();
      });
    }
  }

  closeCreateBlueprintDialog() {
    this.showCreateBlueprintDialog.set(false);
    this.blueprintToSave.set(null);
    this.newBlueprintName.set("");
    this.newBlueprintDescription.set("");
  }

  confirmCreateFromBlueprint() {
    const template = this.blueprintToApply();
    const newTitle = this.applyBlueprintTitle();

    if (template && newTitle) {
      this.controller.createFromBlueprint(template, newTitle, () => {
        // No need to reload - storage auto-updates
        this.showApplyBlueprintDialog.set(false);
        this.showCreateBlueprintDialog.set(false);
      });
    }
  }

  openApplyBlueprint(template: any) {
    this.blueprintToApply.set(template);
    this.applyBlueprintTitle.set(template.name);
    this.showApplyBlueprintDialog.set(true);
    this.showBlueprintDialog.set(false);
  }

  removeBlueprint(templateId: string) {
    if (confirm('Are you sure you want to remove this blueprint?')) {
      this.controller.templateService.deleteTemplate(templateId);
      this.notifyService.showSuccess('Blueprint removed successfully');
    }
  }

  getSubtasksCount(template: any): number {
    return template.tasks.reduce((sum: number, t: any) => sum + (t.subtasks?.length || 0), 0);
  }
}
