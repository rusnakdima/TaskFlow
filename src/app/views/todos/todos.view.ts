/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal, inject, effect } from "@angular/core";
import { RouterModule } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { CdkDragDrop, DragDropModule, moveItemInArray } from "@angular/cdk/drag-drop";
import { HostListener } from "@angular/core";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";

/* services */
import { AuthService } from "@services/auth.service";
import { NotifyService } from "@services/notify.service";
import { FilterService } from "@services/filter.service";
import { SortService } from "@services/sort.service";
import { StorageService } from "@services/storage.service";
import { TemplateService, ProjectTemplate } from "@services/template.service";

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
  private filterService = inject(FilterService);
  private sortService = inject(SortService);
  public templateService = inject(TemplateService);

  constructor(
    private authService: AuthService,
    private storageService: StorageService,
    private notifyService: NotifyService,
    private dataSyncProvider: DataSyncProvider
  ) {
    // Watch for todos data changes and apply filter when data is loaded
    effect(() => {
      const todos = this.storageService.todos();
      if (todos.length > 0) {
        this.applyFilter();
      }
    });
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

  @HostListener("window:keydown", ["$event"])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (event.ctrlKey && event.key === "f") {
      event.preventDefault();
      this.toggleFilter();
    }
    if (event.ctrlKey && event.key === "r") {
      event.preventDefault();
      this.storageService.loadAllData(true).subscribe();
    }
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
          filtered = this.filterService.filterByPriority(filtered, this.activeFilter());
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
    this.activeFilter.set("all");
    this.searchQuery.set("");
    this.applyFilter();
  }

  applyFilter(): void {
    let filtered = this.todos().filter((todo) => todo.visibility === "private" && !todo.isDeleted);

    switch (this.activeFilter()) {
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
        filtered = this.filterService.filterByPriority(filtered, this.activeFilter());
        break;
    }

    // Apply search filter
    if (this.searchQuery()) {
      const query = this.searchQuery().toLowerCase();
      filtered = filtered.filter(
        (todo) =>
          todo.title.toLowerCase().includes(query) || todo.description.toLowerCase().includes(query)
      );
    }

    filtered = this.sortService.sortByOrder(filtered, "desc");
    this.listTodos.set(filtered);
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
      // Get the todo before deleting for potential rollback
      const todoToDelete = this.storageService.getTodoById(todoId);

      // Optimistic update
      this.storageService.removeTodo(todoId);
      this.notifyService.showSuccess("Todo deleted successfully");
      this.applyFilter();

      // Send to backend
      this.dataSyncProvider.delete("todos", todoId, { isOwner: true, isPrivate: true }).subscribe({
        next: () => {},
        error: (err) => {
          // Rollback on failure
          if (todoToDelete) {
            this.storageService.addTask(todoToDelete as any); // addTask will find correct project signal
            this.applyFilter();
          }
          this.notifyService.showError(err.message || "Failed to delete todo");
        },
      });
    }
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

      // Optimistic update
      this.storageService.updateTodo(prevTodo.id, { order: prevTodo.order });
      this.storageService.updateTodo(currentTodo.id, { order: currentTodo.order });
      this.notifyService.showSuccess("Project order updated successfully");

      const now = new Date().toISOString();
      let completedCount = 0;
      let hasError = false;

      [prevTodo, currentTodo].forEach((todo) => {
        this.dataSyncProvider
          .update<Todo>(
            "todos",
            todo.id,
            { id: todo.id, order: todo.order, updatedAt: now },
            { isOwner: true, isPrivate: true }
          )
          .subscribe({
            next: () => {
              completedCount++;
              if (completedCount === 2 || hasError) {
                this.isUpdatingOrder = false;
              }
            },
            error: (err) => {
              hasError = true;
              this.isUpdatingOrder = false;
              this.notifyService.showError(err.message || "Failed to update project order");
              this.storageService.loadAllData(true).subscribe();
            },
          });
      });

      this.isUpdatingOrder = true;
    }
  }

  updateTodoOrder(): void {
    const todos = this.listTodos();
    const previousTodos = todos.map((todo) => ({ ...todo }));

    const transformedTodos = todos.map((todo, index) => ({
      ...todo,
      order: todos.length - 1 - index,
      categories: todo.categories?.map((cat) => cat.id) || [],
      assignees: todo.assignees?.map((assignee) => assignee.id) || [],
    }));

    // Optimistic update
    transformedTodos.forEach((todo) => {
      this.storageService.updateTodo(todo.id, { order: todo.order });
    });
    this.notifyService.showSuccess("Order updated successfully");
    this.isUpdatingOrder = true;

    this.dataSyncProvider
      .updateAll<string>("todos", transformedTodos, { isOwner: true, isPrivate: true })
      .subscribe({
        next: () => {
          this.isUpdatingOrder = false;
        },
        error: (err) => {
          // Rollback
          previousTodos.forEach((todo) => {
            this.storageService.updateTodo(todo.id, { order: todo.order });
          });
          this.isUpdatingOrder = false;
          this.notifyService.showError(err.message || "Failed to update order");
        },
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
      this.templateService.createTemplateFromTodo(todo, name, description);
      this.notifyService.showSuccess(`Project saved as "${name}" Blueprint`);
      this.closeCreateBlueprintDialog();
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
    const title = this.applyBlueprintTitle();

    if (template && title) {
      const todo: Todo = {
        id: `todo-${Date.now()}`,
        title,
        description: template.description,
        isDeleted: false,
        userId: this.userId(),
        user: { id: this.userId() } as any,
        visibility: "private",
        categories: [],
        tasks: [],
        assignees: [],
        priority: template.priority || "medium",
        order: 0,
        startDate: "",
        endDate: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Storage update is handled by WebSocket broadcast (loadAllData)
      this.dataSyncProvider
        .create<Todo>("todos", todo, { isOwner: true, isPrivate: true })
        .subscribe({
          next: (createdTodo) => {
            const todoId = createdTodo.id;
            const tasks = this.templateService.applyTemplate(template, todoId, this.userId());

            if (tasks.length === 0) {
              this.notifyService.showSuccess("Project created from Blueprint!");
              this.showApplyBlueprintDialog.set(false);
              return;
            }

            tasks.forEach((task) => {
              const { subtasks, ...taskWithoutSubtasks } = task;
              // Storage update handled by WebSocket
              this.dataSyncProvider
                .create<Task>(
                  "tasks",
                  taskWithoutSubtasks,
                  { isOwner: true, isPrivate: true },
                  todoId
                )
                .subscribe({
                  next: (createdTask) => {
                    const subtasks = task.subtasks || [];
                    subtasks.forEach((subtask: any) => {
                      const subtaskWithActualTaskId = {
                        ...subtask,
                        taskId: createdTask.id,
                        todoId: todoId,
                      };
                      // Storage update handled by WebSocket
                      this.dataSyncProvider
                        .create<any>(
                          "subtasks",
                          subtaskWithActualTaskId,
                          { isOwner: true, isPrivate: true },
                          todoId
                        )
                        .subscribe();
                    });
                  },
                });
            });

            this.notifyService.showSuccess("Project created from Blueprint!");
            this.showApplyBlueprintDialog.set(false);
          },
          error: (err) => {
            this.notifyService.showError(err.message || "Failed to create project");
          },
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
    if (confirm("Are you sure you want to remove this blueprint?")) {
      this.templateService.deleteTemplate(templateId);
      this.notifyService.showSuccess("Blueprint removed successfully");
    }
  }

  getSubtasksCount(template: any): number {
    return template.tasks.reduce((sum: number, t: any) => sum + (t.subtasks?.length || 0), 0);
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
