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
  DestroyRef,
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
import { Task, TaskStatus, RepeatInterval } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Chat } from "@models/chat.model";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { AuthorizationService } from "@services/features/authorization.service";
import { NotifyService } from "@services/notifications/notify.service";
import { DataService } from "@services/data/data.service";
import { DragDropOrderService } from "@services/ui/drag-drop-order.service";
import { BulkActionService } from "@services/bulk-action.service";
import { DataLoaderService } from "@services/data/data-loader.service";
import { ShortcutService } from "@services/ui/shortcut.service";
import { AppStateService } from "@services/core/app-state.service";
import { DragDropHandlerService } from "@services/ui/drag-drop-handler.service";

/* providers */
import { ApiProvider } from "@providers/api.provider";

/* helpers */
import { BaseItemHelper } from "@helpers/base-item.helper";
import { FilterHelper } from "@helpers/filter.helper";
import { FilteredListHelper } from "@helpers/filtered-list.helper";
import { SortHelper } from "@helpers/sort.helper";
import { BulkActionHelper, BulkOperationResult } from "@helpers/bulk-action.helper";

/* views */
import { BaseListView } from "@views/base-list.view";

/* components */
import { TaskComponent } from "@components/task/task.component";
import { TodoInformationComponent } from "@components/todo-information/todo-information.component";
import { ChatWindowComponent } from "@components/chat-window/chat-window.component";
import { BulkActionsComponent } from "@components/bulk-actions/bulk-actions.component";
import { TableViewComponent } from "@components/table-view/table-view.component";
import { TableField } from "@components/table-view/table-field.model";
import { GithubService } from "@services/github/github.service";
import { EmptyStateComponent } from "@components/empty-state/empty-state.component";
import {
  PageToolbarComponent,
  PageToolbarConfig,
} from "@components/page-toolbar/page-toolbar.component";
import { FilterField } from "@models/filter-config.model";

@Component({
  selector: "app-tasks",
  standalone: true,
  providers: [ApiProvider],
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatExpansionModule,
    MatProgressSpinnerModule,
    RouterModule,
    TaskComponent,
    TodoInformationComponent,
    ChatWindowComponent,
    DragDropModule,
    BulkActionsComponent,
    TableViewComponent,
    EmptyStateComponent,
    PageToolbarComponent,
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

  private dataService = inject(DataService);
  private destroyRef = inject(DestroyRef);
  private dataSyncProvider = inject(ApiProvider);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dragDropService = inject(DragDropOrderService);
  private dragDropHandlerService = inject(DragDropHandlerService);
  private bulkActionHelper = inject(BulkActionHelper);
  public bulkService = inject(BulkActionService);
  private dataLoaderService = inject(DataLoaderService);
  private appStateService = inject(AppStateService);
  private authorizationService = inject(AuthorizationService);
  private githubService = inject(GithubService);

  protected getItems(): { id: string }[] {
    return this.listTasks();
  }

  protected get selectedTasks() {
    return this.selectedItems;
  }

  showInfoBlock = computed(() => this.appStateService.showInfoBlock());
  showMobileInfo = signal(false);
  highlightTaskId = signal<string | null>(null);
  highlightCommentId = signal<string | null>(null);
  openComments = signal(false);
  openChat = signal(false);
  chats = signal<Chat[]>([]);
  private routeSub?: Subscription;
  private loadingRelations = signal<Set<string>>(new Set());

  private chatLoadingGuard = new Set<string>();

  todo = signal<Todo | null>(null);
  todoId = signal<string | null>(null);

  private todoSubscription?: Subscription;

  private chatEffect = effect(() => {
    const tid = this.todoId();
    if (tid) {
      const visibility = this.isPrivate() ? "private" : "shared";
      if (!this.chatLoadingGuard.has(tid)) {
        this.chatLoadingGuard.add(tid);
        this.dataLoaderService.loadInitialChatsForTodo(tid, visibility).subscribe({
          complete: () => this.chatLoadingGuard.delete(tid),
        });
      }
      const sub = this.dataService.getChats(tid).subscribe({
        next: (chats) => this.chats.set(chats),
      });
      this.destroyRef.onDestroy(() => sub.unsubscribe());
    }
  });

  private taskLoadEffect = effect(() => {
    const todoId = this.todoId();
    if (todoId) {
      this.loadInitialTasks();
    }
  });

  isOwner = computed(() => this.todo()?.user_id === this.userId);
  isPrivate = computed(() => this.todo()?.visibility === "private");

  todoTasks = signal<Task[]>([]);
  allTasksForTodo = computed(() => this.todoTasks());

  private tasksSubscription?: Subscription;

  private readonly routeTodoId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get("todoId") ?? null)),
    { initialValue: this.route.snapshot.paramMap.get("todoId") ?? null }
  );

  private loadTodo(todoId: string): void {
    this.todoSubscription?.unsubscribe();
    const sub = this.dataService.getTodo(todoId).subscribe({
      next: (todo) => {
        this.todo.set(todo);
        this.todoId.set(todo.id);
      },
      error: () => {
        this.notifyService.showError("Todo not found.");
      },
    });
    this.todoSubscription = sub;
    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  private loadTasks(todoId: string): void {
    this.tasksSubscription?.unsubscribe();
    const sub = this.dataService.getTasks(todoId).subscribe({
      next: (tasks) => {
        this.todoTasks.set(tasks);
      },
    });
    this.tasksSubscription = sub;
    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  private todoEffect = effect(() => {
    const tid = this.routeTodoId() || this.route.snapshot.data["todo"]?.id;
    if (tid) {
      this.loadTodo(tid);
      this.loadTasks(tid);
    }
  });

  taskPagination = signal<{
    skip: number;
    limit: number;
    total: number;
    hasMore: boolean;
    loading: boolean;
  }>({ skip: 0, limit: 10, total: 0, hasMore: true, loading: false });

  private isLoadingTasks = false;
  private lastLoadedTodoId: string | null = null;

  loadInitialTasks() {
    const todoId = this.todoId();
    const visibility = this.todo()?.visibility || "private";
    if (!todoId) return;

    if (this.isLoadingTasks && this.lastLoadedTodoId === todoId) return;

    this.isLoadingTasks = true;
    this.lastLoadedTodoId = todoId;

    this.dataLoaderService.loadInitialTasksForTodo(todoId, visibility).subscribe({
      next: (tasks: Task[]) => {
        this.todoTasks.set(tasks);
        this.taskPagination.update((p) => ({
          ...p,
          skip: tasks.length,
          hasMore: tasks.length === p.limit,
        }));
      },
      error: () => {
        console.error("Failed to load tasks");
      },
      complete: () => {
        this.isLoadingTasks = false;
      },
    });
  }

  loadMoreTasks() {
    if (this.taskPagination().loading || !this.taskPagination().hasMore) return;
    const todoId = this.todoId();
    const visibility = this.todo()?.visibility || "private";
    if (!todoId) return;

    this.dataLoaderService.loadMoreTasksForTodo(todoId, visibility).subscribe({
      next: (tasks: Task[]) => {
        this.todoTasks.update((current) => [...current, ...tasks]);
        this.taskPagination.update((p) => ({
          ...p,
          skip: p.skip + tasks.length,
          loading: false,
          hasMore: tasks.length === p.limit,
        }));
      },
    });
  }

  listTasks = computed(() => {
    return FilteredListHelper.filterAndSort(this.todoTasks(), {
      filter: this.activeFilter(),
      query: this.searchQuery(),
      filterType: "status",
    });
  });

  getTaskUnreadCommentsCount(task: Task): number {
    const userId = this.authService.getValueByKey("id");
    if (!userId) return 0;

    const currentChats = this.chats();
    if (currentChats.length === 0) return 0;

    let count = 0;
    const taskSubtasks = this.getTaskSubtasks(task.id);
    for (const subtask of taskSubtasks) {
      const subtaskComments = currentChats.filter((c) => !c.deleted_at);
      if (subtaskComments.length === 0) continue;
      count += subtaskComments.filter((c: Chat) => {
        if (c.user_id === userId) return false;
        if (c.read_by && c.read_by.includes(userId)) return false;
        return true;
      }).length;
    }
    return count;
  }

  getTaskSubtasks(taskId: string): Subtask[] {
    return [];
  }

  getToolbarConfig(): PageToolbarConfig {
    return {
      infoToggle: {
        onToggle: () => this.toggleInfoBlock(),
        isActive: this.showInfoBlock(),
        label: "Info",
      },
      selectAll: {
        onToggle: () => this.toggleSelectAll(),
        isAllSelected: this.isAllSelected(),
        count: this.selectedTasks().size,
        highlight: this.selectedTasks().size > 0 && !this.isAllSelected(),
      },
      filter: {
        onToggle: () => this.toggleFilter(),
        isActive: this.showFilter(),
      },
      newButton: {
        onClick: () => this.router.navigate(["create_task"], { relativeTo: this.route }),
        label: "New Task",
        icon: "add",
      },
      viewMode: {
        mode: this.viewMode(),
        pageKey: "tasks",
        onModeChange: (mode) => this.setViewMode(mode),
      },
      filterFields: this.filterFields,
      showFilter: this.showFilter(),
      onFiltersChange: (filters) => this.onFiltersChange(filters),
    };
  }

  onFiltersChange(filters: Record<string, string | string[] | any>): void {
    this._activeFilters.set(filters);
  }

  private _activeFilters = signal<Record<string, string | string[] | any>>({});

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

  filterFields: FilterField[] = [
    {
      key: "status",
      label: "Status",
      type: "checkbox",
      options: [
        { key: "all", label: "All" },
        { key: "pending", label: "Pending" },
        { key: "completed", label: "Completed" },
        { key: "skipped", label: "Skipped" },
        { key: "failed", label: "Failed" },
      ],
    },
    {
      key: "priority",
      label: "Priority",
      type: "checkbox",
      options: [
        { key: "all", label: "All" },
        { key: "low", label: "Low" },
        { key: "medium", label: "Medium" },
        { key: "high", label: "High" },
      ],
    },
  ];

  taskTableFields: TableField[] = [
    { key: "title", label: "Task", type: "text", sortable: true },
    { key: "priority", label: "Priority", type: "priority", sortable: true },
    { key: "status", label: "Status", type: "status" },
    { key: "subtasks", label: "Subtasks", type: "array-count" },
    { key: "start_date", label: "Start Date", type: "date", sortable: true },
    { key: "end_date", label: "Due Date", type: "date", sortable: true },
    { key: "created_at", label: "Created", type: "datetime", sortable: true },
  ];

  override ngOnInit(): void {
    super.ngOnInit();

    this.userId = this.authService.getValueByKey("id");
    this.pageKey = "tasks";

    this.viewMode.set(this.loadViewModePreference());

    this.bulkService.setMode("tasks");
    this.bulkService.updateTotalCount(0);

    this.subscriptions.add(
      this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
        this.clearSelection();
      })
    );

    this.subscriptions.add(
      this.route.queryParams.subscribe((queryParams: any) => {
        super.handleHighlightQueryParams(queryParams, "highlightTaskId", "task-", "ring-green-500");
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
      })
    );

    const routeData = this.route.snapshot.data;
    if (!routeData?.["todo"] && !this.route.snapshot.paramMap.get("todoId")) {
      this.notifyService.showError("Invalid todo ID.");
    }

    this.loading.set(false);
  }

  toggleTaskCompletion(task: Task) {
    const todoId = this.todoId();
    if (!todoId) return;

    if (
      task.status === TaskStatus.PENDING &&
      !this.checkDependenciesCompleted(task.depends_on || [])
    ) {
      this.notifyService.showError("Cannot complete task: waiting for dependencies");
      return;
    }

    const newStatus = BaseItemHelper.getNextStatus(task.status);

    this.dataService.updateTask(task.id, { ...task, status: newStatus }).subscribe({
      next: () => {},
      error: (err) => {
        console.error("Update task status failed:", err);
        this.notifyService.showError("Failed to update task status");
      },
    });
  }

  toggleExpandTask(task: Task) {
    this.toggleExpandItem(task.id);
  }

  isTaskExpanded(taskId?: string): boolean {
    return this.isItemExpanded(taskId);
  }

  toggleSubtaskCompletion(subtask: Subtask) {
    const todoId = this.todoId();
    if (!todoId) return;

    const newStatus = BaseItemHelper.getNextStatus(subtask.status);

    this.dataService.updateSubtask(subtask.id, { status: newStatus }).subscribe({
      next: () => {},
      error: (err) => {
        console.error("Update subtask status failed:", err);
        this.notifyService.showError("Failed to update subtask status");
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
    const todoId = this.todoId();
    if (!todoId) return;

    const todo = this.todo();
    const isPrivate = todo?.visibility !== "shared";

    const nextTask = { ...task };
    delete (nextTask as any)._id;
    nextTask.id = "";
    nextTask.status = TaskStatus.PENDING;
    nextTask.created_at = new Date().toISOString();
    nextTask.updated_at = nextTask.created_at;

    if (task.start_date) {
      const nextStart = new Date(task.start_date);
      const nextEnd = task.end_date ? new Date(task.end_date) : null;
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
          if (nextEnd) nextEnd.setDate(nextEnd.getDate() + 1);
          break;
      }
      nextTask.start_date = nextStart.toISOString();
      if (nextEnd) nextTask.end_date = nextEnd.toISOString();
    }

    this.dataService.createTask(nextTask).subscribe({
      next: (result: Task) => {
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

  toggleMobileInfo() {
    this.showMobileInfo.update((v) => !v);
  }

  toggleInfoBlock() {
    this.appStateService.toggleInfoBlock();
  }

  override getUnreadCount(): number {
    return super.getUnreadCount(this.chats);
  }

  updateTaskInline(event: { task: Task; field: string; value: any }) {
    const todoId = this.todoId();
    if (!todoId) return;

    this.dataService.updateTask(event.task.id, { [event.field]: event.value }).subscribe({
      next: () => {},
      error: (err) => {
        console.error("Update task failed:", err);
        this.notifyService.showError("Failed to update task");
      },
    });
  }

  onRowClick(task: any): void {
    this.router.navigate([task.id, "subtasks"], { relativeTo: this.route });
  }

  getTaskTableActions() {
    const actions = [
      { key: "edit", icon: "edit", label: "Edit" },
      { key: "delete", icon: "delete", label: "Delete" },
    ];

    const currentTodo = this.todo();
    if (currentTodo?.github_repo_name) {
      actions.unshift({ key: "create_issue", icon: "bug_report", label: "Create GitHub Issue" });
    }

    return actions;
  }

  onTaskTableAction(event: { action: string; item: Task }): void {
    switch (event.action) {
      case "edit":
        this.router.navigate([event.item.id, "edit_task"], {
          relativeTo: this.route,
          queryParams: { isOwner: this.isOwner(), isPrivate: this.isPrivate() },
        });
        break;
      case "delete":
        this.deleteTask(event.item.id);
        break;
      case "create_issue":
        this.createGithubIssueFromTask(event.item);
        break;
    }
  }

  private createGithubIssueFromTask(task: Task): void {
    const currentTodo = this.todo();
    if (!currentTodo?.github_repo_name) {
      this.notifyService.showError("Project is not linked to a GitHub repository");
      return;
    }

    const [owner, repo] = currentTodo.github_repo_name.split("/");
    if (!owner || !repo) {
      this.notifyService.showError("Invalid GitHub repository configuration");
      return;
    }

    const issueBody = `**Task Details**

**Description:** ${task.description || "N/A"}
**Priority:** ${task.priority || "medium"}
**Due Date:** ${task.end_date || "N/A"}
**Created in:** TaskFlow

---
[View in TaskFlow](taskflow://tasks/${task.id})`;

    this.githubService.createIssue(owner, repo, task.title, issueBody).subscribe({
      next: (result) => {
        this.notifyService.showSuccess(`GitHub issue created: ${result.html_url}`);
      },
      error: (err) => {
        this.notifyService.showError("Failed to create GitHub issue: " + (err.message || err));
      },
    });
  }

  onCommentToggle(taskId: string): void {
    this.highlightCommentId.set(null);
  }

  deleteTask(taskId?: string) {
    const todoId = this.todoId();
    if (!todoId || !taskId) return;

    if (!confirm("Are you sure?")) return;

    this.dataService.deleteTask(taskId).subscribe({
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
    this.dragDropHandlerService.onListDropped<Task>(
      this.taskPlaceholder,
      (prev: number, curr: number) => {
        const todoId = this.todoId();
        if (!todoId) return;

        const syntheticEvent = {
          previousIndex: prev,
          currentIndex: curr,
          item: null,
          container: null,
          previousContainer: null,
          distance: { x: 0, y: 0 },
        } as unknown as CdkDragDrop<Task[]>;

        this.dragDropService
          .handleDrop(
            syntheticEvent,
            this.listTasks(),
            "tasks",
            "tasks",
            todoId,
            this.isPrivate() ? "private" : "shared"
          )
          .subscribe({
            next: () => {},
            error: (err) => {
              console.error("Reorder tasks failed:", err);
              this.notifyService.showError("Failed to reorder tasks");
            },
          });
      }
    );
  }

  onTaskDrop(event: CdkDragDrop<Task[]>): void {
    const todoId = this.todoId();
    if (!todoId) return;

    this.dragDropService
      .handleDrop(
        event,
        this.listTasks(),
        "tasks",
        "tasks",
        todoId,
        this.isPrivate() ? "private" : "shared"
      )
      .subscribe({
        next: () => {},
        error: (err) => {
          console.error("Task drop failed:", err);
          this.notifyService.showError("Failed to drop task");
        },
      });
  }

  toggleTaskSelection(event: { id: string; selected: boolean }) {
    const { id, selected } = event;
    this.selectedTasks.update((selectedIds) => {
      const newSelected = new Set(selectedIds);
      if (selected) {
        newSelected.add(id);
      } else {
        newSelected.delete(id);
      }
      this.bulkService.setSelectionState(newSelected.size, this.isAllSelected());
      return newSelected;
    });
  }

  override clearSelection() {
    super.clearSelection();
  }

  bulkUpdatePriority(priority: string) {
    const todoId = this.todoId();
    if (!todoId) return;

    const selectedIds: string[] = Array.from(this.selectedTasks());

    this.bulkActionHelper
      .bulkUpdateField(
        selectedIds.map((id) => ({ id })),
        "priority",
        priority,
        (id, data) => this.dataService.updateTask(id, data)
      )
      .subscribe({
        next: (result: BulkOperationResult) => {
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
    const todoId = this.todoId();
    if (!todoId) return;

    const selectedIds: string[] = Array.from(this.selectedTasks());

    if (selectedIds.length === 0) {
      return;
    }

    const updatePromises = Array.from(selectedIds).map((id) => {
      return firstValueFrom(
        this.bulkActionHelper.bulkUpdateStatus([{ id, status: "" }], status, (id, data) => {
          return this.dataService.updateTask(id, { status: status as TaskStatus });
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
    const todoId = this.todoId();
    if (!todoId) return;

    const selectedIds: string[] = Array.from(this.selectedTasks());
    if (!confirm(`Delete ${selectedIds.length} tasks?`)) return;

    this.bulkActionHelper
      .bulkDelete(
        selectedIds.map((id) => ({ id })),
        (id) => this.dataService.deleteTask(id)
      )
      .subscribe({
        next: (result) => {
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

  bulkArchive() {
    const todoId = this.todoId();
    if (!todoId) return;

    const selectedIds: string[] = Array.from(this.selectedTasks());
    if (selectedIds.length === 0) return;

    if (confirm(`Archive ${selectedIds.length} task(s)?`)) {
      this.bulkActionHelper
        .bulkDelete(
          selectedIds.map((id) => ({ id })),
          (id) => this.dataService.deleteTask(id)
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
