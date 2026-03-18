/* sys lib */
import { CommonModule } from "@angular/common";
import {
  Component,
  OnInit,
  AfterViewInit,
  ViewChild,
  signal,
  effect,
  inject,
  computed,
  HostListener,
} from "@angular/core";
import { ActivatedRoute, RouterModule, NavigationEnd, Router } from "@angular/router";
import { FormsModule } from "@angular/forms";
import {
  CdkDragDrop,
  CdkDragEnter,
  CdkDropList,
  DragDropModule,
  DragRef,
} from "@angular/cdk/drag-drop";
import { Subscription, firstValueFrom } from "rxjs";
import { filter, map } from "rxjs/operators";
import { toSignal } from "@angular/core/rxjs-interop";

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
import { BulkActionService } from "@services/bulk-action.service";
import { DataSyncService } from "@services/data/data-sync.service";
import { ShortcutService } from "@services/ui/shortcut.service";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";
import { TodoRelations } from "@models/relations.config";

/* helpers */
import { BaseItemHelper } from "@helpers/base-item.helper";
import { FilterHelper } from "@helpers/filter.helper";
import { SortHelper } from "@helpers/sort.helper";
import { BulkActionHelper, BulkOperationResult } from "@helpers/bulk-action.helper";

/* views */
import { BaseListView } from "@views/base-list.view";

/* components */
import { TaskComponent } from "@components/task/task.component";
import { TodoInformationComponent } from "@components/todo-information/todo-information.component";
import { FilterBarComponent } from "@components/filter-bar/filter-bar.component";
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";
import { ChatWindowComponent } from "@components/chat-window/chat-window.component";
import { BulkActionsComponent } from "@components/bulk-actions/bulk-actions.component";

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
    FilterBarComponent,
    ChatWindowComponent,
    DragDropModule,
    CheckboxComponent,
    BulkActionsComponent,
  ],
  templateUrl: "./tasks.view.html",
})
export class TasksView extends BaseListView implements OnInit, AfterViewInit {
  @ViewChild("taskPlaceholder", { read: CdkDropList }) private taskPlaceholder!: CdkDropList;

  private dragTarget: CdkDropList | null = null;
  private dragTargetIndex = 0;
  private dragSource: CdkDropList | null = null;
  private dragSourceIndex = 0;
  private dragRef: DragRef | null = null;

  private storageService = inject(StorageService);
  private authService = inject(AuthService);
  private notifyService = inject(NotifyService);
  private dataSyncProvider = inject(DataSyncProvider);
  private dataSyncService = inject(DataSyncService);
  private shortcutService = inject(ShortcutService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dragDropService = inject(DragDropOrderService);
  private bulkActionHelper = new BulkActionHelper();
  public bulkService = inject(BulkActionService);

  // State signals
  highlightTaskId = signal<string | null>(null);
  highlightCommentId = signal<string | null>(null);
  openComments = signal(false);
  openChat = signal(false);
  expandedTasks = signal<Set<string>>(new Set());
  chats = signal<any[]>([]);
  private routeSub?: Subscription;

  // Bulk selection state (like admin page)
  selectedTasks = signal<Set<string>>(new Set());

  // Reactive route param — updates when navigating between todos without component destroy (H-11)
  private readonly routeTodoId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get("todoId") ?? null)),
    { initialValue: this.route.snapshot.paramMap.get("todoId") ?? null }
  );

  private chatEffect = effect(() => {
    const tid = this.todo()?.id;
    if (tid) {
      const reactiveChats = this.storageService.getChatsByTodoReactive(tid)();
      this.chats.set(reactiveChats);
    }
  });

  todo = computed(() => {
    const tid = this.routeTodoId() || this.route.snapshot.data["todo"]?.id;
    if (!tid) return null;
    return this.storageService.getTodoReactive(tid)() || null;
  });

  isOwner = computed(() => this.todo()?.userId === this.userId);
  isPrivate = computed(() => this.todo()?.visibility === "private");

  // Computed signals for data flow - Always use storage as the single source of truth
  todoTasks = computed(() => {
    const todoFromSignal = this.todo();
    const todoId = todoFromSignal?.id;
    if (!todoId) return [];
    // Always use storage data for real-time updates
    return this.storageService.getTasksByTodoId(todoId);
  });

  listTasks = computed(() => {
    let filtered = this.todoTasks();
    const filter = this.activeFilter();
    const query = this.searchQuery().toLowerCase().trim();

    // Apply status/priority filter
    switch (filter) {
      case "active":
        filtered = FilterHelper.filterByCompletion(filtered, "active");
        break;
      case "completed":
        filtered = FilterHelper.filterByCompletion(filtered, "completed");
        break;
      case "skipped":
        filtered = FilterHelper.filterByStatus(filtered, "skipped");
        break;
      case "failed":
        filtered = FilterHelper.filterByStatus(filtered, "failed");
        break;
      case "done":
        filtered = FilterHelper.filterByStatus(filtered, "done");
        break;
      case "high":
        filtered = FilterHelper.filterByPriority(filtered, "high");
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

    // Skip sorting during drag to prevent snap-back
    const result = SortHelper.sortByOrder(filtered, "desc");
    return result;
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

    // Initialize bulk action service
    this.bulkService.setMode("tasks");
    this.bulkService.updateTotalCount(0);

    // Subscribe to refresh shortcut (Ctrl+R)
    this.shortcutService.refresh$.subscribe(() => {
      this.dataSyncService.loadAllData(true).subscribe(() => {
        this.notifyService.showSuccess("Data refreshed");
      });
    });

    // Clear selection when navigating away from this view
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
      this.clearSelection();
    });

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

    // Get resolved todo data from route - todo is now computed from storage
    const routeData = this.route.snapshot.data;
    if (!routeData?.["todo"] && !this.route.snapshot.paramMap.get("todoId")) {
      this.notifyService.showError("Invalid todo ID.");
    }

    const todoId = routeData?.["todo"]?.id || this.route.snapshot.paramMap.get("todoId");
    if (todoId) {
      this.ensureTaskTreeLoaded(todoId);
    }
    this.loading.set(false);
  }

  private ensureTaskTreeLoaded(todoId: string): void {
    const todo = this.storageService.getById("todos", todoId);
    const hasSubtasks = !!todo?.tasks?.some((task) => (task.subtasks || []).length > 0);

    if (hasSubtasks) return;

    this.dataSyncProvider
      .crud<Todo>("get", "todos", {
        id: todoId,
        load: TodoRelations.loadAll,
        isOwner: this.isOwner(),
        isPrivate: this.isPrivate(),
      })
      .subscribe({
        next: (loadedTodo) => {
          if (loadedTodo) {
            this.storageService.updateItem("todos", todoId, loadedTodo);
          }
        },
        error: (err: any) => {
          this.notifyService.showError(err.message || "Failed to load subtasks");
        },
      });
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

    const newStatus = BaseItemHelper.getNextStatus(task.status);

    // Update task status via DataSyncProvider (storage updated automatically)
    this.dataSyncProvider
      .crud<Task>("update", "tasks", {
        id: task.id,
        data: { status: newStatus },
        parentTodoId: todoId,
      })
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
    this.dataSyncProvider
      .crud<Subtask>("update", "subtasks", {
        id: subtask.id,
        data: { status: newStatus },
        parentTodoId: todoId,
      })
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

    this.dataSyncProvider
      .crud<Task>("create", "tasks", { data: nextTask, parentTodoId: todoId })
      .subscribe({
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
    const chats = this.chats();
    return chats.filter((c) => !c.readBy || !c.readBy.includes(currentUserId)).length;
  }

  updateTaskInline(event: { task: Task; field: string; value: any }) {
    const todoId = this.todo()?.id;
    if (!todoId) return;

    // Update task via DataSyncProvider (storage updated automatically)
    this.dataSyncProvider
      .crud<Task>("update", "tasks", {
        id: event.task.id,
        data: { [event.field]: event.value },
        parentTodoId: todoId,
      })
      .subscribe();
  }

  deleteTask(taskId: string) {
    const todoId = this.todo()?.id;
    if (!todoId) return;

    if (!confirm("Are you sure?")) return;

    // Delete task via DataSyncProvider (storage updated automatically)
    this.dataSyncProvider.crud("delete", "tasks", { id: taskId, parentTodoId: todoId }).subscribe({
      next: () => {
        this.notifyService.showSuccess("Task deleted successfully");
      },
    });
  }

  ngAfterViewInit(): void {
    if (!this.taskPlaceholder?.element?.nativeElement) return;
    const el = this.taskPlaceholder.element.nativeElement as HTMLElement;
    el.style.display = "none";
    el.parentNode?.removeChild(el);
  }

  onTaskListEntered(event: CdkDragEnter): void {
    const { item, container } = event;
    if (container === this.taskPlaceholder) return;
    if (!this.taskPlaceholder?.element?.nativeElement) return;

    const placeholderEl = this.taskPlaceholder.element.nativeElement as HTMLElement;
    const sourceEl = item.dropContainer.element.nativeElement as HTMLElement;
    const dropEl = container.element.nativeElement as HTMLElement;
    const parent = dropEl.parentElement;
    if (!parent) return;

    const dragIndex = Array.prototype.indexOf.call(
      parent.children,
      this.dragSource ? placeholderEl : sourceEl
    );
    const dropIndex = Array.prototype.indexOf.call(parent.children, dropEl);

    if (!this.dragSource) {
      this.dragSourceIndex = dragIndex;
      this.dragSource = item.dropContainer;
      placeholderEl.style.width = sourceEl.offsetWidth + "px";
      placeholderEl.style.minHeight = sourceEl.offsetHeight + "px";
      sourceEl.parentElement?.removeChild(sourceEl);
    }

    this.dragTargetIndex = dropIndex;
    this.dragTarget = container;
    this.dragRef = item._dragRef;

    placeholderEl.style.display = "";
    parent.insertBefore(placeholderEl, dropIndex > dragIndex ? dropEl.nextSibling : dropEl);

    this.taskPlaceholder._dropListRef.enter(
      item._dragRef,
      item.element.nativeElement.offsetLeft,
      item.element.nativeElement.offsetTop
    );
  }

  onTaskListDropped(): void {
    if (!this.dragTarget || !this.taskPlaceholder?.element?.nativeElement) return;

    const placeholderEl = this.taskPlaceholder.element.nativeElement as HTMLElement;
    const parent = placeholderEl.parentElement;
    if (parent) {
      placeholderEl.style.display = "none";
      parent.removeChild(placeholderEl);
      parent.appendChild(placeholderEl);
      const sourceEl = this.dragSource?.element.nativeElement as HTMLElement;
      if (sourceEl) {
        parent.insertBefore(sourceEl, parent.children[this.dragSourceIndex]);
      }
    }

    if (this.taskPlaceholder._dropListRef.isDragging() && this.dragRef) {
      this.taskPlaceholder._dropListRef.exit(this.dragRef);
    }

    const prev = this.dragSourceIndex;
    const curr = this.dragTargetIndex;
    this.dragTarget = null;
    this.dragSource = null;
    this.dragRef = null;

    if (prev !== curr) {
      const todoId = this.todo()?.id;
      if (!todoId) return;
      const syntheticEvent = {
        previousIndex: prev,
        currentIndex: curr,
      } as CdkDragDrop<Task[]>;
      this.dragDropService
        .handleDrop(syntheticEvent, this.listTasks(), "tasks", "tasks", todoId, {
          isOwner: this.isOwner(),
          isPrivate: this.isPrivate(),
        })
        .subscribe();
    }
  }

  onTaskDrop(event: CdkDragDrop<Task[]>): void {
    const todoId = this.todo()?.id;
    if (!todoId) return;

    this.dragDropService
      .handleDrop(event, this.listTasks(), "tasks", "tasks", todoId, {
        isOwner: this.isOwner(),
        isPrivate: this.isPrivate(),
      })
      .subscribe();
  }

  /**
   * Toggle selection of a single task
   */
  toggleTaskSelection(event: { id: string; selected: boolean }) {
    const { id, selected } = event;
    this.selectedTasks.update((selectedIds) => {
      const newSelected = new Set(selectedIds);
      if (selected) {
        newSelected.add(id);
      } else {
        newSelected.delete(id);
      }
      // Sync with bulk service for display
      this.bulkService.setSelectionState(newSelected.size, this.isAllSelected());
      return newSelected;
    });
  }

  toggleSelectAll() {
    const allTasks = this.listTasks();
    const allSelected = this.isAllSelected();

    this.selectedTasks.update((selected) => {
      const newSelected = new Set(selected);
      if (allSelected) {
        allTasks.forEach((task) => newSelected.delete(task.id));
      } else {
        allTasks.forEach((task) => newSelected.add(task.id));
      }
      // Sync with bulk service for display
      this.bulkService.setSelectionState(newSelected.size, !allSelected);
      return newSelected;
    });
  }

  clearSelection() {
    this.selectedTasks.set(new Set());
    this.bulkService.setSelectionState(0, false);
  }

  isAllSelected() {
    const currentList = this.listTasks();
    return currentList.length > 0 && currentList.every((task) => this.selectedTasks().has(task.id));
  }

  bulkUpdatePriority(priority: string) {
    const todoId = this.todo()?.id;
    if (!todoId) return;

    const selectedIds: string[] = Array.from(this.selectedTasks());

    this.bulkActionHelper
      .bulkUpdateField(
        selectedIds.map((id) => ({ id })),
        "priority",
        priority,
        (id, data) =>
          this.dataSyncProvider.crud<Task>("update", "tasks", { id, data, parentTodoId: todoId })
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

    const selectedIds: string[] = Array.from(this.selectedTasks());

    if (selectedIds.length === 0) {
      return;
    }

    const updatePromises = Array.from(selectedIds).map((id) => {
      return firstValueFrom(
        this.bulkActionHelper.bulkUpdateStatus([{ id, status: "" }], status, (id, data) => {
          return this.dataSyncProvider.crud<Task>("update", "tasks", {
            id,
            data: { status: status as TaskStatus },
            parentTodoId: todoId,
          });
        })
      );
    });

    Promise.all(updatePromises)
      .then(() => {
        this.clearSelection();
        this.notifyService.showSuccess(`${selectedIds.length} task(s) updated`);
      })
      .catch((err) => {
        this.notifyService.showError("Failed to update tasks");
      });
  }

  bulkDelete() {
    const todoId = this.todo()?.id;
    if (!todoId) return;

    const selectedIds: string[] = Array.from(this.selectedTasks());
    if (!confirm(`Delete ${selectedIds.length} tasks?`)) return;

    this.bulkActionHelper
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

  /**
   * Bulk archive selected tasks (move to archive)
   */
  bulkArchive() {
    const todoId = this.todo()?.id;
    if (!todoId) return;

    const selectedIds: string[] = Array.from(this.selectedTasks());
    if (selectedIds.length === 0) return;

    if (confirm(`Archive ${selectedIds.length} task(s)?`)) {
      this.bulkActionHelper
        .bulkDelete(
          selectedIds.map((id) => ({ id })),
          (id) => this.dataSyncProvider.crud("delete", "tasks", { id, parentTodoId: todoId })
        )
        .subscribe({
          next: (result) => {
            this.clearSelection();
            if (result.errorCount > 0) {
              this.notifyService.showWarning(
                `Archived ${result.successCount} tasks, ${result.errorCount} failed.`
              );
            } else {
              this.notifyService.showSuccess(`Archived ${result.successCount} tasks.`);
            }
          },
        });
    }
  }

  onBulkAction(actionId: string) {
    if (actionId === "delete") this.bulkDelete();
    else {
      const val = prompt(`Enter new ${actionId}:`);
      if (val) actionId === "priority" ? this.bulkUpdatePriority(val) : this.bulkUpdateStatus(val);
    }
  }
}
