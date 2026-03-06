/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal, inject } from "@angular/core";
import { ActivatedRoute, RouterModule } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { CdkDragDrop, DragDropModule, moveItemInArray } from "@angular/cdk/drag-drop";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatExpansionModule } from "@angular/material/expansion";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";

/* services */
import { AuthService } from "@services/auth.service";
import { NotifyService } from "@services/notify.service";
import { FilterService } from "@services/filter.service";
import { SortService } from "@services/sort.service";
import { BulkActionService } from "@services/bulk-action.service";
import { StorageService } from "@services/storage.service";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

/* components */
import { TaskComponent } from "@components/task/task.component";
import { TodoInformationComponent } from "@components/todo-information/todo-information.component";
import { BulkActionsComponent } from "@components/bulk-actions/bulk-actions.component";
import { FilterBarComponent } from "@components/filter-bar/filter-bar.component";

/* controllers */
import { TasksController } from "@controllers/tasks.controller";

@Component({
  selector: "app-tasks",
  standalone: true,
  providers: [DataSyncProvider, TasksController],
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatExpansionModule,
    RouterModule,
    TaskComponent,
    TodoInformationComponent,
    BulkActionsComponent,
    FilterBarComponent,
    DragDropModule,
  ],
  templateUrl: "./tasks.view.html",
})
export class TasksView implements OnInit {
  private controller = inject(TasksController);
  private filterService = inject(FilterService);
  private sortService = inject(SortService);
  private bulkActionService = inject(BulkActionService);

  constructor(
    private route: ActivatedRoute,
    private authService: AuthService,
    private notifyService: NotifyService,
    private dataSyncProvider: DataSyncProvider,
    private storageService: StorageService
  ) {}

  // Use storage signals directly for source data
  tasks = this.storageService.tasks;
  todo = signal<Todo | null>(null);
  
  // Separate signals for filtered/sorted display list
  tempListTasks = signal<Task[]>([]);
  listTasks = signal<Task[]>([]);

  selectedTasks = signal<Set<string>>(new Set());
  showBulkActions = signal(false);

  private isUpdatingOrder: boolean = false;

  activeFilter = signal("all");
  showFilter = signal(false);
  searchQuery = signal("");

  highlightTaskId = signal<string | null>(null);

  // Expose controller properties for template
  get isOwner(): boolean {
    return this.controller.isOwner;
  }

  get isPrivate(): boolean {
    return this.controller.isPrivate;
  }

  filterOptions = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "completed", label: "Completed" },
    { key: "skipped", label: "Skipped" },
    { key: "failed", label: "Failed" },
    { key: "done", label: "Done" },
    { key: "high", label: "High Priority" },
  ];

  bulkActions = [
    { id: "priority", label: "Priority", icon: "flag", color: "primary" as const },
    { id: "status", label: "Status", icon: "check_circle", color: "default" as const },
    { id: "delete", label: "Delete", icon: "delete", color: "warn" as const },
  ];

  ngOnInit(): void {
    const userId = this.authService.getValueByKey("id");

    this.route.queryParams.subscribe((queryParams: any) => {
      if (queryParams.highlightTaskId) {
        this.highlightTaskId.set(queryParams.highlightTaskId);
        setTimeout(() => this.highlightTaskId.set(null), 5000);
      }
    });

    const routeData = this.route.snapshot.data;
    if (routeData?.["todo"]) {
      const todoData = routeData["todo"];
      this.todo.set(todoData);
      this.controller.init(todoData, userId);
      this.loadTasksByTodoId(todoData.id);
    }
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  trackByTaskId(index: number, task: Task): string {
    return task.id;
  }

  loadTasksByTodoId(todoId: string) {
    // Read tasks directly from storage - filtered by todoId
    const filteredTasks = this.tasks().filter(task => task.todoId === todoId);
    
    if (filteredTasks && filteredTasks.length > 0) {
      this.tempListTasks.set(filteredTasks);
      this.applyFilter();
    }
  }

  searchFunc(data: Task[]) {
    const sortedData = this.sortService.sortByStatus(data, "asc");
    this.listTasks.set(sortedData);
  }

  toggleTaskCompletion(task: Task) {
    this.controller.toggleTaskCompletion(task);
  }

  toggleFilter() {
    this.showFilter.update((val) => !val);
  }

  changeFilter(filter: string) {
    this.activeFilter.set(filter);
    this.applyFilter();
  }

  onSearchChange(query: string) {
    // This is called when search input changes
    this.searchQuery.set(query);
    // Re-apply filter with new search query
    this.applyFilter();
  }

  onSearchResults(results: any[]) {
    if (this.searchQuery()) {
      this.listTasks.set(results);
    }
  }

  clearFilters() {
    this.activeFilter.set('all');
    this.searchQuery.set('');
    this.applyFilter();
  }

  applyFilter() {
    // Read tasks from storage service, filtered by current todoId
    let filtered = this.tasks().filter(task => 
      !this.todo() ? false : task.todoId === this.todo()!.id
    );

    console.log("[TasksView] applyFilter - tasks count:", filtered.length);

    switch (this.activeFilter()) {
      case "active":
        filtered = this.filterService.filterByCompletion(filtered, "active");
        break;
      case "completed":
        filtered = this.filterService.filterByCompletion(filtered, "completed");
        break;
      case "skipped":
        filtered = this.filterService.filterByStatus(filtered, "skipped");
        break;
      case "failed":
        filtered = this.filterService.filterByStatus(filtered, "failed");
        break;
      case "done":
        filtered = this.filterService.filterByStatus(filtered, "done");
        break;
      case "high":
        filtered = this.filterService.filterByPriority(filtered, "high");
        break;
    }

    // Apply search filter
    if (this.searchQuery()) {
      const query = this.searchQuery().toLowerCase();
      filtered = filtered.filter((task) =>
        task.title.toLowerCase().includes(query) ||
        task.description.toLowerCase().includes(query)
      );
    }

    filtered = this.sortService.sortByOrder(filtered, "desc");
    console.log("[TasksView] applyFilter - filtered count:", filtered.length);
    this.listTasks.set(filtered);

    if (this.highlightTaskId()) {
      setTimeout(() => {
        const element = document.getElementById("task-" + this.highlightTaskId());
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 500);
    }
  }

  updateTaskInline(event: { task: Task; field: string; value: string }) {
    this.controller.updateTaskInline(event.task, event.field, event.value);
  }

  deleteTask(taskId: string) {
    if (confirm("Are you sure you want to delete this task?")) {
      this.controller.deleteTask(taskId, () => {
        // Re-apply filter to update the list after deletion
        this.applyFilter();
        if (this.todo()) {
          this.todo.update(
            (todo) => ({ ...todo!, tasks: (todo!.tasks || []).filter((t) => t.id !== taskId) }) as Todo
          );
        }
      });
    }
  }

  onTaskDrop(event: CdkDragDrop<Task[]>): void {
    if (this.isUpdatingOrder) {
      this.notifyService.showWarning("Please wait for previous operation to complete");
      return;
    }

    if (event.previousIndex !== event.currentIndex) {
      const tasks = this.listTasks();
      const prevTask = tasks[event.previousIndex];
      const currentTask = tasks[event.currentIndex];

      const tempOrder = prevTask.order;
      prevTask.order = currentTask.order;
      currentTask.order = tempOrder;

      moveItemInArray(tasks, event.previousIndex, event.currentIndex);
      this.controller.updateTwoTaskOrder(prevTask, currentTask, () => {
        this.isUpdatingOrder = false;
      });
      this.isUpdatingOrder = true;
    }
  }

  toggleTaskSelection(taskId: string): void {
    const newSelected = this.bulkActionService.toggleSelection(this.selectedTasks(), taskId);
    this.selectedTasks.set(newSelected);
    this.showBulkActions.set(newSelected.size > 0);
  }

  selectAllTasks(): void {
    const allIds = this.bulkActionService.selectAll(this.listTasks());
    this.selectedTasks.set(allIds);
    this.showBulkActions.set(true);
  }

  clearSelection(): void {
    this.selectedTasks.set(this.bulkActionService.clearSelection());
    this.showBulkActions.set(false);
  }

  isAllSelected(): boolean {
    return this.bulkActionService.isAllSelected(this.selectedTasks(), this.listTasks());
  }

  toggleSelectAll(): void {
    if (this.isAllSelected()) {
      this.clearSelection();
    } else {
      this.selectAllTasks();
    }
  }

  bulkUpdatePriority(priority: string): void {
    const selectedIds = Array.from(this.selectedTasks());
    this.controller.bulkUpdatePriority(selectedIds, priority, () => {
      this.clearSelection();
      // No need to reload - storage auto-updates
    });
  }

  bulkUpdateStatus(status: string): void {
    const selectedIds = Array.from(this.selectedTasks());
    this.controller.bulkUpdateStatus(selectedIds, status, () => {
      this.clearSelection();
      // No need to reload - storage auto-updates
    });
  }

  bulkDelete(): void {
    const selectedIds = Array.from(this.selectedTasks());
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} task(s)?`)) {
      return;
    }

    this.controller.bulkDelete(selectedIds, () => {
      this.clearSelection();
      // No need to reload - storage auto-updates
    });
  }

  onBulkAction(actionId: string) {
    switch (actionId) {
      case "priority":
        const priority = prompt("Enter priority (low/medium/high):", "medium");
        if (priority) this.bulkUpdatePriority(priority);
        break;
      case "status":
        const status = prompt("Enter status (pending/completed/skipped/failed):", "pending");
        if (status) this.bulkUpdateStatus(status);
        break;
      case "delete":
        this.bulkDelete();
        break;
    }
  }
}
