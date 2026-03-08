/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal, inject, computed } from "@angular/core";
import { ActivatedRoute, RouterModule } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { CdkDragDrop, DragDropModule, moveItemInArray } from "@angular/cdk/drag-drop";
import { HostListener } from "@angular/core";
import { forkJoin } from "rxjs";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatExpansionModule } from "@angular/material/expansion";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus, RepeatInterval, PriorityTask } from "@models/task.model";

/* services */
import { AuthService } from "@services/auth.service";
import { NotifyService } from "@services/notify.service";
import { FilterService } from "@services/filter.service";
import { SortService } from "@services/sort.service";
import { BulkActionService, BulkOperationResult } from "@services/bulk-action.service";
import { StorageService } from "@services/storage.service";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

/* components */
import { TaskComponent } from "@components/task/task.component";
import { TodoInformationComponent } from "@components/todo-information/todo-information.component";
import { BulkActionsComponent } from "@components/bulk-actions/bulk-actions.component";
import { FilterBarComponent } from "@components/filter-bar/filter-bar.component";

@Component({
  selector: "app-tasks",
  standalone: true,
  providers: [DataSyncProvider],
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
  private filterService = inject(FilterService);
  private sortService = inject(SortService);
  private bulkActionService = inject(BulkActionService);
  private storageService = inject(StorageService);
  private authService = inject(AuthService);
  private notifyService = inject(NotifyService);
  private dataSyncProvider = inject(DataSyncProvider);
  private route = inject(ActivatedRoute);

  // State signals
  todo = signal<Todo | null>(null);
  activeFilter = signal("all");
  showFilter = signal(false);
  searchQuery = signal("");
  highlightTaskId = signal<string | null>(null);
  selectedTasks = signal<Set<string>>(new Set());
  showBulkActions = signal(false);

  // Computed signals for data flow
  todoTasks = computed(() => {
    const todoId = this.todo()?.id;
    return todoId ? this.storageService.getTasksByTodoId(todoId)() : [];
  });

  listTasks = computed(() => {
    let filtered = this.todoTasks();
    const filter = this.activeFilter();
    const query = this.searchQuery().toLowerCase().trim();

    // Apply status/priority filter
    switch (filter) {
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
    if (query) {
      filtered = filtered.filter(
        (task) =>
          task.title.toLowerCase().includes(query) ||
          (task.description && task.description.toLowerCase().includes(query))
      );
    }

    return this.sortService.sortByOrder(filtered, "desc");
  });

  isOwner: boolean = true;
  isPrivate: boolean = true;
  userId: string = "";
  private isUpdatingOrder: boolean = false;

  @HostListener("window:keydown", ["$event"])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (event.ctrlKey && event.key === "f") {
      event.preventDefault();
      this.toggleFilter();
    }
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

  ngOnInit(): void {
    this.userId = this.authService.getValueByKey("id");

    this.route.queryParams.subscribe((queryParams: any) => {
      if (queryParams.highlightTaskId) {
        this.highlightTaskId.set(queryParams.highlightTaskId);
        setTimeout(() => {
          const element = document.getElementById("task-" + queryParams.highlightTaskId);
          if (element) element.scrollIntoView({ behavior: "smooth", block: "center" });
          this.highlightTaskId.set(null);
        }, 500);
      }
    });

    const routeData = this.route.snapshot.data;
    if (routeData?.["todo"]) {
      const todoData = routeData["todo"];
      this.todo.set(todoData);
      this.isOwner = todoData.userId === this.userId;
      this.isPrivate = todoData.visibility === "private";
    }
  }

  toggleTaskCompletion(task: Task) {
    const todoId = this.todo()?.id;
    if (!todoId) return;

    if (
      task.status === TaskStatus.PENDING &&
      !this.checkDependenciesCompleted(task.dependsOn || [])
    ) {
      this.notifyService.showError("Cannot complete task: waiting for dependencies");
      return;
    }

    let newStatus: TaskStatus;
    switch (task.status) {
      case TaskStatus.PENDING:
        newStatus = TaskStatus.COMPLETED;
        break;
      case TaskStatus.COMPLETED:
        newStatus = TaskStatus.SKIPPED;
        break;
      case TaskStatus.SKIPPED:
        newStatus = TaskStatus.FAILED;
        break;
      default:
        newStatus = TaskStatus.PENDING;
        break;
    }

    const previousStatus = task.status;
    // Optimistic update
    this.storageService.updateTask(task.id, { status: newStatus });

    this.dataSyncProvider
      .update<Task>("tasks", task.id, { ...task, status: newStatus }, undefined, todoId)
      .subscribe({
        next: (result: Task) => {
          // Manually update storage
          this.storageService.updateTask(result.id, result);
          if (
            newStatus === TaskStatus.COMPLETED &&
            task.repeat &&
            task.repeat !== RepeatInterval.NONE
          ) {
            this.generateNextRecurringTask(task);
          }
        },
        error: (err: any) => {
          this.storageService.updateTask(task.id, { status: previousStatus });
          this.notifyService.showError(err.message || "Failed to update status");
        },
      });
  }

  checkDependenciesCompleted(dependsOn: string[]): boolean {
    if (!dependsOn?.length) return true;
    const tasks = this.todoTasks();
    return dependsOn.every((depId) => {
      const depTask = tasks.find((t) => t.id === depId);
      return (
        depTask &&
        (depTask.status === TaskStatus.COMPLETED || depTask.status === TaskStatus.SKIPPED)
      );
    });
  }

  generateNextRecurringTask(task: Task): void {
    const todoId = this.todo()?.id;
    if (!todoId) return;

    const nextTask = { ...task };
    delete (nextTask as any)._id;
    nextTask.id = "";
    nextTask.status = TaskStatus.PENDING;
    nextTask.createdAt = new Date().toISOString();
    nextTask.updatedAt = nextTask.createdAt;

    if (task.startDate) {
      const nextStart = new Date(task.startDate);
      const nextEnd = task.endDate ? new Date(task.endDate) : null;
      switch (task.repeat) {
        case RepeatInterval.DAILY:
          nextStart.setDate(nextStart.getDate() + 1);
          if (nextEnd) nextEnd.setDate(nextEnd.getDate() + 1);
          break;
        case RepeatInterval.WEEKLY:
          nextStart.setDate(nextStart.getDate() + 7);
          if (nextEnd) nextEnd.setDate(nextEnd.getDate() + 7);
          break;
        case RepeatInterval.MONTHLY:
          nextStart.setMonth(nextStart.getMonth() + 1);
          if (nextEnd) nextEnd.setMonth(nextEnd.getMonth() + 1);
          break;
      }
      nextTask.startDate = nextStart.toISOString();
      if (nextEnd) nextTask.endDate = nextEnd.toISOString();
    }

    this.dataSyncProvider.create<Task>("tasks", nextTask, undefined, todoId).subscribe({
      next: (result: Task) => {
        // Manually add to storage
        this.storageService.addTask(result);
        this.notifyService.showInfo(`Next recurring task created: ${task.title}`);
      },
      error: () => {
        this.notifyService.showError("Failed to create recurring task");
      },
    });
  }

  toggleFilter() {
    this.showFilter.update((v) => !v);
  }
  changeFilter(filter: string) {
    this.activeFilter.set(filter);
  }
  onSearchChange(query: string) {
    this.searchQuery.set(query);
  }
  onSearchResults(results: any[]) {
    /* Logic handled by computed listTasks */
  }
  clearFilters() {
    this.activeFilter.set("all");
    this.searchQuery.set("");
  }
  applyFilter() {
    /* Purely reactive via computed listTasks */
  }

  updateTaskInline(event: { task: Task; field: string; value: any }) {
    const todoId = this.todo()?.id;
    if (!todoId) return;

    const previousValue = (event.task as any)[event.field];
    // Optimistic update
    this.storageService.updateTask(event.task.id, { [event.field]: event.value });

    this.dataSyncProvider
      .update<Task>(
        "tasks",
        event.task.id,
        { ...event.task, [event.field]: event.value },
        undefined,
        todoId
      )
      .subscribe({
        next: (result: Task) => {
          // Manually update storage
          this.storageService.updateTask(result.id, result);
        },
        error: (err: any) => {
          this.storageService.updateTask(event.task.id, { [event.field]: previousValue });
          this.notifyService.showError(err.message || "Update failed");
        },
      });
  }

  deleteTask(taskId: string) {
    const todoId = this.todo()?.id;
    if (!todoId) return;

    if (!confirm("Are you sure?")) return;
    const taskToDelete = this.storageService.getTaskById(taskId);
    // Optimistic delete
    this.storageService.removeTask(taskId);

    this.dataSyncProvider.delete("tasks", taskId, undefined, todoId).subscribe({
      error: (err: any) => {
        // Rollback
        if (taskToDelete) this.storageService.addTask(taskToDelete);
        this.notifyService.showError(err.message || "Delete failed");
      },
    });
  }

  onTaskDrop(event: CdkDragDrop<Task[]>): void {
    const todoId = this.todo()?.id;
    if (!todoId) return;

    if (this.isUpdatingOrder) return;
    if (event.previousIndex === event.currentIndex) return;

    const tasks = [...this.listTasks()];
    const prevTask = tasks[event.previousIndex];
    const currentTask = tasks[event.currentIndex];

    const tempOrder = prevTask.order;
    prevTask.order = currentTask.order;
    currentTask.order = tempOrder;

    moveItemInArray(tasks, event.previousIndex, event.currentIndex);
    this.isUpdatingOrder = true;

    // Optimistic update
    this.storageService.updateTask(prevTask.id, { order: prevTask.order });
    this.storageService.updateTask(currentTask.id, { order: currentTask.order });

    const now = new Date().toISOString();
    forkJoin([
      this.dataSyncProvider.update<Task>(
        "tasks",
        prevTask.id,
        { id: prevTask.id, order: prevTask.order, updatedAt: now },
        undefined,
        todoId
      ),
      this.dataSyncProvider.update<Task>(
        "tasks",
        currentTask.id,
        { id: currentTask.id, order: currentTask.order, updatedAt: now },
        undefined,
        todoId
      ),
    ]).subscribe({
      next: (results: Task[]) => {
        // Manually update storage
        results.forEach((r) => this.storageService.updateTask(r.id, r));
        this.isUpdatingOrder = false;
      },
      error: (err: any) => {
        this.isUpdatingOrder = false;
        this.notifyService.showError("Failed to update order");
        this.storageService.loadAllData(true).subscribe();
      },
    });
  }

  toggleTaskSelection(taskId: string) {
    const newSelected = this.bulkActionService.toggleSelection(this.selectedTasks(), taskId);
    this.selectedTasks.set(newSelected);
    this.showBulkActions.set(newSelected.size > 0);
  }

  toggleSelectAll() {
    if (this.isAllSelected()) this.clearSelection();
    else {
      this.selectedTasks.set(this.bulkActionService.selectAll(this.listTasks()));
      this.showBulkActions.set(true);
    }
  }

  clearSelection() {
    this.selectedTasks.set(new Set());
    this.showBulkActions.set(false);
  }
  isAllSelected() {
    return this.bulkActionService.isAllSelected(this.selectedTasks(), this.listTasks());
  }

  bulkUpdatePriority(priority: string) {
    const todoId = this.todo()?.id;
    if (!todoId) return;

    const selectedIds = Array.from(this.selectedTasks());
    // Optimistic
    selectedIds.forEach((id) =>
      this.storageService.updateTask(id, { priority: priority as PriorityTask })
    );
    this.clearSelection();

    this.bulkActionService
      .bulkUpdateField(
        selectedIds.map((id) => ({ id })),
        "priority",
        priority,
        (id, data) => this.dataSyncProvider.update<Task>("tasks", id, data, undefined, todoId)
      )
      .subscribe({
        next: (result: BulkOperationResult) => {
          // WebSocket will sync with real data
        },
      });
  }

  bulkUpdateStatus(status: string) {
    const todoId = this.todo()?.id;
    if (!todoId) return;

    const selectedIds = Array.from(this.selectedTasks());
    // Optimistic
    selectedIds.forEach((id) =>
      this.storageService.updateTask(id, { status: status as TaskStatus })
    );
    this.clearSelection();

    this.bulkActionService
      .bulkUpdateStatus(
        selectedIds.map((id) => ({ id, status: "" })),
        status,
        (id, data) => this.dataSyncProvider.update<Task>("tasks", id, data, undefined, todoId)
      )
      .subscribe({
        next: (result: BulkOperationResult) => {
          // WebSocket will sync with real data
        },
      });
  }

  bulkDelete() {
    const todoId = this.todo()?.id;
    if (!todoId) return;

    const selectedIds = Array.from(this.selectedTasks());
    if (!confirm(`Delete ${selectedIds.length} tasks?`)) return;

    // Optimistic
    selectedIds.forEach((id) => this.storageService.removeTask(id));
    this.clearSelection();

    this.bulkActionService
      .bulkDelete(
        selectedIds.map((id) => ({ id })),
        (id) => this.dataSyncProvider.delete("tasks", id, undefined, todoId)
      )
      .subscribe();
  }

  onBulkAction(actionId: string) {
    if (actionId === "delete") this.bulkDelete();
    else {
      const val = prompt(`Enter new ${actionId}:`);
      if (val) actionId === "priority" ? this.bulkUpdatePriority(val) : this.bulkUpdateStatus(val);
    }
  }
}
