/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal, inject, computed } from "@angular/core";
import { ActivatedRoute, RouterModule } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { CdkDragDrop, DragDropModule } from "@angular/cdk/drag-drop";
import { HostListener } from "@angular/core";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatExpansionModule } from "@angular/material/expansion";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus, RepeatInterval, PriorityTask } from "@models/task.model";
import { Subtask } from "@models/subtask.model";

/* helpers */
import { StateHelper } from "@helpers/state.helper";

/* services */
import { AuthService } from "@services/auth.service";
import { NotifyService } from "@services/notify.service";
import { FilterService } from "@services/filter.service";
import { SortService } from "@services/sort.service";
import { BulkActionService, BulkOperationResult } from "@services/bulk-action.service";
import { StorageService } from "@services/storage.service";
import { DragDropOrderService } from "@services/drag-drop-order.service";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

/* components */
import { TaskComponent } from "@components/task/task.component";
import { TodoInformationComponent } from "@components/todo-information/todo-information.component";
import { BulkActionsComponent } from "@components/bulk-actions/bulk-actions.component";
import { FilterBarComponent } from "@components/filter-bar/filter-bar.component";
import { ChatWindowComponent } from "@components/chat-window/chat-window.component";

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
    ChatWindowComponent,
    DragDropModule,
  ],
  templateUrl: "./tasks.view.html",
})
export class TasksView implements OnInit {
  private filterService = inject(FilterService);
  private sortService = inject(SortService);
  private bulkActionService = inject(BulkActionService);
  private storageService = inject(StorageService);
  private stateHelper = inject(StateHelper);
  private authService = inject(AuthService);
  private notifyService = inject(NotifyService);
  private dataSyncProvider = inject(DataSyncProvider);
  private route = inject(ActivatedRoute);
  private dragDropService = inject(DragDropOrderService);

  // State signals
  todo = signal<Todo | null>(null);
  activeFilter = signal("all");
  showFilter = signal(false);
  searchQuery = signal("");
  highlightTaskId = signal<string | null>(null);
  highlightCommentId = signal<string | null>(null);
  openComments = signal(false);
  openChat = signal(false);
  selectedTasks = signal<Set<string>>(new Set());
  showBulkActions = signal(false);
  expandedTasks = signal<Set<string>>(new Set());

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
          if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "center" });
            element.classList.add("ring-4", "ring-green-500", "animate-pulse");
            setTimeout(() => {
              element.classList.remove("ring-4", "ring-green-500", "animate-pulse");
            }, 2000);
          }
          this.highlightTaskId.set(null);
        }, 500);
      }
      if (queryParams.highlightCommentId) {
        this.highlightCommentId.set(queryParams.highlightCommentId);
        this.openComments.set(true);
      }
      if (queryParams.openComments) {
        this.openComments.set(true);
      }
      if (queryParams.openChat) {
        this.openChat.set(true);
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

    // Use StateHelper for optimistic update
    this.stateHelper.updateOptimistically<Task>(
      "task",
      task.id,
      { status: newStatus },
      task,
      todoId
    );
  }

  toggleExpandTask(task: Task) {
    this.expandedTasks.update((set) => {
      const newSet = new Set(set);
      if (newSet.has(task.id)) {
        newSet.delete(task.id);
      } else {
        newSet.add(task.id);
      }
      return newSet;
    });
  }

  isTaskExpanded(taskId: string): boolean {
    return this.expandedTasks().has(taskId);
  }

  toggleSubtaskCompletion(subtask: Subtask) {
    const todoId = this.todo()?.id;
    if (!todoId) return;

    let newStatus: TaskStatus;
    switch (subtask.status) {
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

    this.stateHelper.updateOptimistically<Subtask>(
      "subtask",
      subtask.id,
      { status: newStatus },
      subtask,
      todoId
    );
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
        this.storageService.addItem("task", result);
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

    this.stateHelper.updateOptimistically<Task>(
      "task",
      event.task.id,
      { [event.field]: event.value },
      event.task,
      todoId
    );
  }

  deleteTask(taskId: string) {
    const todoId = this.todo()?.id;
    if (!todoId) return;

    const taskToDelete = this.storageService.getTaskById(taskId);
    if (!taskToDelete) return;

    if (!confirm("Are you sure?")) return;

    this.stateHelper.deleteOptimistically<Task>("task", taskId, taskToDelete, todoId);
  }

  onTaskDrop(event: CdkDragDrop<Task[]>): void {
    const todoId = this.todo()?.id;
    if (!todoId) return;

    this.dragDropService
      .handleDrop(event, this.listTasks(), "task", "tasks", todoId, {
        isOwner: this.isOwner,
        isPrivate: this.isPrivate,
      })
      .subscribe();
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
      this.storageService.updateItem("task", id, { priority: priority as PriorityTask })
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
      this.storageService.updateItem("task", id, { status: status as TaskStatus })
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
    selectedIds.forEach((id) => this.storageService.removeItem("task", id));
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
