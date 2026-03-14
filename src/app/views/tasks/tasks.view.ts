/* sys lib */
import { CommonModule } from "@angular/common";
import {
  Component,
  OnInit,
  signal,
  inject,
  computed,
  OnDestroy,
  HostListener,
} from "@angular/core";
import { ActivatedRoute, RouterModule } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { CdkDragDrop, DragDropModule } from "@angular/cdk/drag-drop";
import { Subscription } from "rxjs";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatExpansionModule } from "@angular/material/expansion";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus, RepeatInterval, PriorityTask } from "@models/task.model";
import { Subtask } from "@models/subtask.model";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { NotifyService } from "@services/notifications/notify.service";
import { StorageService } from "@services/core/storage.service";
import { DragDropOrderService } from "@services/ui/drag-drop-order.service";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

/* bases */
import { BaseView } from "@bases/base.view";

/* helpers */
import { BaseItemHelper } from "@helpers/base-item.helper";
import { FilterHelper } from "@helpers/filter.helper";
import { SortHelper } from "@helpers/sort.helper";
import { BulkActionHelper, BulkOperationResult } from "@helpers/bulk-action.helper";

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
    MatProgressSpinnerModule,
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
export class TasksView extends BaseView implements OnInit {
  private filterService: FilterHelper;
  private sortService: SortHelper;
  private bulkActionService: BulkActionHelper;
  private storageService = inject(StorageService);
  private authService = inject(AuthService);
  private notifyService = inject(NotifyService);
  private dataSyncProvider = inject(DataSyncProvider);
  private route = inject(ActivatedRoute);
  private dragDropService = inject(DragDropOrderService);
  private baseHelper = new BaseItemHelper();

  constructor() {
    super();
    this.filterService = new FilterHelper();
    this.sortService = new SortHelper();
    this.bulkActionService = new BulkActionHelper();
  }

  // State signals
  todo = signal<Todo | null>(null);
  highlightTaskId = signal<string | null>(null);
  highlightCommentId = signal<string | null>(null);
  openComments = signal(false);
  openChat = signal(false);
  selectedTasks = signal<Set<string>>(new Set());
  showBulkActions = signal(false);
  showFilter = signal(false);
  activeFilter = signal<string>("all");
  searchQuery = signal<string>("");
  expandedTasks = signal<Set<string>>(new Set());
  private routeSub?: Subscription;

  // Computed signals for data flow - Always use storage as the single source of truth
  todoTasks = computed(() => {
    const todoFromSignal = this.todo();
    const todoId = todoFromSignal?.id;
    if (!todoId) return [];
    // Always use storage data for real-time updates
    return this.storageService.getTasksByTodoId(todoId)();
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

  // Get unread comments count for a task (from all subtasks, NOT task's own comments)
  // Only counts comments where user is NOT the author AND hasn't read
  getTaskUnreadCommentsCount(task: Task): number {
    const userId = this.authService.getValueByKey("id");
    if (!userId || !task.subtasks || task.subtasks.length === 0) return 0;

    let count = 0;
    // Count only subtask comments (not task's own comments)
    for (const subtask of task.subtasks) {
      if (!subtask.comments || subtask.comments.length === 0) continue;
      count += subtask.comments.filter((c: any) => {
        if (c.isDeleted) return false;
        // Skip if user is the author (they've read their own comment)
        if (c.authorId === userId) return false;
        if (c.readBy && c.readBy.includes(userId)) return false;
        // Only count subtask comments (must have subtaskId)
        if (!c.subtaskId) return false;
        return true;
      }).length;
    }
    return count;
  }

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

    this.routeSub = this.route.queryParams.subscribe((queryParams: any) => {
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

    // Get resolved todo data from route
    const routeData = this.route.snapshot.data;
    if (routeData?.["todo"]) {
      const todoData = routeData["todo"];
      this.todo.set(todoData);
      this.isOwner = todoData.userId === this.userId;
      this.isPrivate = todoData.visibility === "private";
    } else {
      // Fallback: try to get todo ID from route params and fetch from storage
      this.loading.set(true);
      const todoId = this.route.snapshot.paramMap.get("todoId");
      if (todoId) {
        const todoFromStorage = this.storageService.getTodoById(todoId);
        if (todoFromStorage) {
          this.todo.set(todoFromStorage);
          this.isOwner = todoFromStorage.userId === this.userId;
          this.isPrivate = todoFromStorage.visibility === "private";
        } else {
          // Wait a bit for storage to be populated (e.g., after creating a task)
          setTimeout(() => {
            const retryTodo = this.storageService.getTodoById(todoId);
            if (retryTodo) {
              this.todo.set(retryTodo);
              this.isOwner = retryTodo.userId === this.userId;
              this.isPrivate = retryTodo.visibility === "private";
            } else {
              this.notifyService.showError("Todo not found. Please try again.");
            }
            this.loading.set(false);
          }, 300);
          return; // Don't set loading to false yet
        }
      } else {
        this.notifyService.showError("Invalid todo ID.");
      }
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
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

    const newStatus = this.baseHelper.getNextStatus(task.status);

    // Update task status via DataSyncProvider (storage updated automatically)
    this.dataSyncProvider.crud<Task>("update", "tasks", { id: task.id, data: { status: newStatus }, parentTodoId: todoId })
      .subscribe();
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

    // Update subtask status via DataSyncProvider (storage updated automatically)
    this.dataSyncProvider.crud<Subtask>("update", "subtasks", { id: subtask.id, data: { status: newStatus }, parentTodoId: todoId })
      .subscribe();
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

    this.dataSyncProvider.crud<Task>("create", "tasks", { data: nextTask, parentTodoId: todoId }).subscribe({
      next: (result: Task) => {
        // Storage updated automatically by DataSyncProvider
        this.notifyService.showInfo(`Next recurring task created: ${task.title}`);
      },
      error: () => {
        this.notifyService.showError("Failed to create recurring task");
      },
    });
  }

  toggleChat() {
    this.openChat.update((v) => !v);
  }

  getUnreadCount(): number {
    const todoId = this.todo()?.id;
    if (!todoId) return 0;
    const currentUserId = this.authService.getValueByKey("id");
    const chats = this.storageService.getChatsByTodo(todoId);
    return chats.filter((c) => !c.readBy || !c.readBy.includes(currentUserId)).length;
  }

  updateTaskInline(event: { task: Task; field: string; value: any }) {
    const todoId = this.todo()?.id;
    if (!todoId) return;

    // Update task via DataSyncProvider (storage updated automatically)
    this.dataSyncProvider.crud<Task>("update", "tasks", { id: event.task.id, data: { [event.field]: event.value }, parentTodoId: todoId })
      .subscribe();
  }

  deleteTask(taskId: string) {
    const todoId = this.todo()?.id;
    if (!todoId) return;

    if (!confirm("Are you sure?")) return;

    // Delete task via DataSyncProvider (storage updated automatically)
    this.dataSyncProvider.crud("delete", "tasks", { id: taskId, parentTodoId: todoId })
      .subscribe({
        next: () => {
          this.notifyService.showSuccess("Task deleted successfully");
        },
      });
  }

  onTaskDrop(event: CdkDragDrop<Task[]>): void {
    const todoId = this.todo()?.id;
    if (!todoId) return;

    this.dragDropService
      .handleDrop(event, this.listTasks(), "tasks", "tasks", todoId, {
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

    this.bulkActionService
      .bulkUpdateField(
        selectedIds.map((id) => ({ id })),
        "priority",
        priority,
        (id, data) => this.dataSyncProvider.crud<Task>("update", "tasks", { id, data, parentTodoId: todoId })
      )
      .subscribe({
        next: (result: BulkOperationResult) => {
          // Storage updated automatically by DataSyncProvider for each successful update
          this.clearSelection();
          if (result.errorCount > 0) {
            this.notifyService.showWarning(
              `Updated ${result.successCount} tasks, ${result.errorCount} failed.`
            );
          } else {
            this.notifyService.showSuccess(`Updated ${result.successCount} tasks.`);
          }
        },
      });
  }

  bulkUpdateStatus(status: string) {
    const todoId = this.todo()?.id;
    if (!todoId) return;

    const selectedIds = Array.from(this.selectedTasks());

    this.bulkActionService
      .bulkUpdateStatus(
        selectedIds.map((id) => ({ id, status: "" })),
        status,
        (id, data) => {
          // Ensure id is included in the update payload
          const updateData = { ...data, id };
          return this.dataSyncProvider.crud<Task>("update", "tasks", { id, data: updateData, parentTodoId: todoId });
        }
      )
      .subscribe({
        next: (result: BulkOperationResult) => {
          // Storage updated automatically by DataSyncProvider for each successful update
          this.clearSelection();
          if (result.errorCount > 0) {
            this.notifyService.showWarning(
              `Updated ${result.successCount} tasks, ${result.errorCount} failed.`
            );
          } else {
            this.notifyService.showSuccess(`Updated ${result.successCount} tasks.`);
          }
        },
      });
  }

  bulkDelete() {
    const todoId = this.todo()?.id;
    if (!todoId) return;

    const selectedIds = Array.from(this.selectedTasks());
    if (!confirm(`Delete ${selectedIds.length} tasks?`)) return;

    this.bulkActionService
      .bulkDelete(
        selectedIds.map((id) => ({ id })),
        (id) => this.dataSyncProvider.crud("delete", "tasks", { id, parentTodoId: todoId })
      )
      .subscribe({
        next: (result) => {
          // Storage updated automatically by DataSyncProvider for each successful delete
          this.clearSelection();
          if (result.errorCount > 0) {
            this.notifyService.showWarning(
              `Deleted ${result.successCount} tasks, ${result.errorCount} failed.`
            );
          } else {
            this.notifyService.showSuccess(`Deleted ${result.successCount} tasks.`);
          }
        },
      });
  }

  onBulkAction(actionId: string) {
    if (actionId === "delete") this.bulkDelete();
    else {
      const val = prompt(`Enter new ${actionId}:`);
      if (val) actionId === "priority" ? this.bulkUpdatePriority(val) : this.bulkUpdateStatus(val);
    }
  }

  /**
   * Toggle filter bar visibility
   */
  toggleFilter(): void {
    this.showFilter.update(v => !v);
  }

  /**
   * Handle search query change
   */
  onSearchChange(query: string): void {
    this.searchQuery.set(query);
  }

  /**
   * Handle filter change
   */
  changeFilter(filter: string): void {
    this.activeFilter.set(filter);
  }
}
