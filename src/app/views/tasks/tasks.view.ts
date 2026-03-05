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

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

/* components */
import { SearchComponent } from "@components/fields/search/search.component";
import { TaskComponent } from "@components/task/task.component";
import { TodoInformationComponent } from "@components/todo-information/todo-information.component";
import { BulkActionBarComponent } from "@components/bulk-action-bar/bulk-action-bar.component";

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
    SearchComponent,
    TaskComponent,
    TodoInformationComponent,
    BulkActionBarComponent,
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
    private dataSyncProvider: DataSyncProvider
  ) {}

  listTasks = signal<Task[]>([]);
  tempListTasks = signal<Task[]>([]);
  todo = signal<Todo | null>(null);

  selectedTasks = signal<Set<string>>(new Set());
  showBulkActions = signal(false);

  private isUpdatingOrder: boolean = false;

  activeFilter = signal("all");
  showFilter = signal(false);

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
      this.getTasksByTodoId(todoData.id);
    }
  }

  trackByTaskId(index: number, task: Task): string {
    return task.id;
  }

  getTasksByTodoId(todoId: string) {
    this.controller.getTasksByTodoId(todoId).subscribe({
      next: (tasks) => {
        this.tempListTasks.set(tasks);
        this.applyFilter();
      },
      error: () => {
        this.notifyService.showError("Failed to load tasks");
      },
    });
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

  applyFilter() {
    let filtered = [...this.tempListTasks()];

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

    filtered = this.sortService.sortByOrder(filtered, "desc");
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
        this.getTasksByTodoId(this.todo()?.id ?? "");
        if (this.todo()) {
          this.todo.update(
            (todo) => ({ ...todo!, tasks: todo!.tasks!.filter((t) => t.id !== taskId) }) as Todo
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
      this.getTasksByTodoId(this.todo()?.id ?? "");
    });
  }

  bulkUpdateStatus(status: string): void {
    const selectedIds = Array.from(this.selectedTasks());
    this.controller.bulkUpdateStatus(selectedIds, status, () => {
      this.clearSelection();
      this.getTasksByTodoId(this.todo()?.id ?? "");
    });
  }

  bulkDelete(): void {
    const selectedIds = Array.from(this.selectedTasks());
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} task(s)?`)) {
      return;
    }

    this.controller.bulkDelete(selectedIds, () => {
      this.clearSelection();
      this.getTasksByTodoId(this.todo()?.id ?? "");
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
