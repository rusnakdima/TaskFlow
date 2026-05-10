/* sys lib */
import { CommonModule } from "@angular/common";
import {
  Component,
  OnInit,
  AfterViewInit,
  ViewChild,
  signal,
  inject,
  computed,
  NO_ERRORS_SCHEMA,
} from "@angular/core";
import { ActivatedRoute, RouterModule, NavigationEnd, Router } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { CdkDragDrop, CdkDragEnter, CdkDropList, DragDropModule } from "@angular/cdk/drag-drop";
import { filter } from "rxjs/operators";

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
import { DragDropOrderService } from "@services/ui/drag-drop-order.service";
import { BulkActionService } from "@services/bulk-action.service";
import { REQUEST_SERVICE, Visibility } from "@services/api.service";

import { AppStateService } from "@services/core/app-state.service";
import { DragDropHandlerService } from "@services/ui/drag-drop-handler.service";
import { PromptDialogService } from "@services/core/prompt-dialog.service";

/* helpers */
import { BaseItemHelper } from "@helpers/base-item.helper";

import { DEFAULT_CACHE_TTL_MS } from "@helpers/index";

/* helpers - tasks view */
import { TasksKanbanHelper } from "./tasks-kanban.helper";
import { TasksFiltersHelper } from "./tasks-filters.helper";
import { TasksActionsHelper } from "./tasks-actions.helper";
import { TasksCommentsHelper } from "./tasks-comments.helper";

/* views */
import { BaseListView } from "@views/base-list.view";

/* components */
import { TodoInformationComponent } from "@components/todo-information/todo-information.component";
import { ChatWindowComponent } from "@components/chat-window/chat-window.component";
import { BulkActionsComponent } from "@components/bulk-actions/bulk-actions.component";
import { TableViewComponent } from "@components/table-view/table-view.component";
import { TableField, TableFieldActionButton } from "@models/table-field.model";
import { EmptyStateComponent } from "@components/empty-state/empty-state.component";
import {
  PageToolbarComponent,
  PageToolbarConfig,
} from "@components/page-toolbar/page-toolbar.component";
import { ItemExpandDetailsComponent } from "@components/item-expand-details/item-expand-details.component";
import { LoadingStateComponent } from "@components/loading-state/loading-state.component";
import { ChatFabComponent } from "@components/chat-fab/chat-fab.component";
import { ItemCardComponent } from "@components/item-card/item-card.component";
import { TASK_CARD_CONFIG } from "@constants/item-display.constants";
import { KanbanTaskCardComponent } from "@components/kanban-task-card/kanban-task-card.component";

@Component({
  selector: "app-tasks",
  standalone: true,
  schemas: [NO_ERRORS_SCHEMA],
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatExpansionModule,
    MatProgressSpinnerModule,
    RouterModule,
    TodoInformationComponent,
    ChatWindowComponent,
    DragDropModule,
    BulkActionsComponent,
    TableViewComponent,
    EmptyStateComponent,
    PageToolbarComponent,
    ItemExpandDetailsComponent,
    LoadingStateComponent,
    ChatFabComponent,
    ItemCardComponent,
    KanbanTaskCardComponent,
  ],
  templateUrl: "./tasks.view.html",
})
export class TasksView extends BaseListView implements OnInit, AfterViewInit {
  @ViewChild("taskPlaceholder", { read: CdkDropList }) private taskPlaceholder!: CdkDropList;

  private requestService = inject(REQUEST_SERVICE);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dragDropService = inject(DragDropOrderService);
  private dragDropHandlerService = inject(DragDropHandlerService);
  private promptDialogService = inject(PromptDialogService);

  public bulkService = inject(BulkActionService);

  private appStateService = inject(AppStateService);

  kanbanHelper = inject(TasksKanbanHelper);
  filtersHelper = inject(TasksFiltersHelper);
  actionsHelper = inject(TasksActionsHelper);
  commentsHelper = inject(TasksCommentsHelper);

  protected get selectedTasks() {
    return this.selectedItems;
  }

  protected getItems(): { id: string }[] {
    return this.listTasks();
  }

  userId: string = "";

  get filterFields() {
    return this.filtersHelper.filterFields;
  }

  onFiltersChange(filters: Record<string, string | string[] | any>): void {
    this.filtersHelper.onFiltersChange(filters);
  }

  showInfoBlock = computed(() => this.appStateService.showInfoBlock());
  showMobileInfo = signal(false);
  highlightTaskId = signal<string | null>(null);
  openComments = signal(false);
  openChat = signal(false);
  chats = signal<Chat[]>([]);

  taskCardConfig = TASK_CARD_CONFIG;

  todo = signal<Todo | null>(null);
  todoId = signal<string | null>(null);

  isOwner(): boolean {
    return true;
  }

  isPrivate(): boolean {
    const todo = this.todo();
    return todo?.visibility !== "shared";
  }

  todoTasks = signal<Task[]>([]);
  allTasksForTodo = computed(() => this.todoTasks());

  private loadInitialTodo(todoId: string): void {
    this.requestService
      .get<Todo>("todos", todoId, {
        visibility: "all",
        load: ["user", "categories", "assignees"],
      })
      .subscribe({
        next: (todo) => {
          if (todo) {
            this.todo.set(todo);
            this.commentsHelper.setTodoVisibility((todo.visibility || "private") as Visibility);
            const tasks = todo.tasks || [];
            if (tasks.length > 0) {
              this.todoTasks.set(tasks);
              this.taskPagination.update((p) => ({
                ...p,
                skip: tasks.length,
                total: tasks.length,
                hasMore: false,
                loading: false,
              }));
            } else {
              this.loadInitialTasks();
            }
          } else {
            this.notifyService.showError("Todo not found.");
          }
        },
        error: () => {
          this.notifyService.showError("Failed to load todo.");
        },
      });
  }

  taskPagination = signal<{
    skip: number;
    limit: number;
    total: number;
    hasMore: boolean;
    loading: boolean;
  }>({ skip: 0, limit: 10, total: 0, hasMore: true, loading: false });

  loadInitialTasks(forceRefresh = false) {
    const todoId = this.todoId();
    if (!todoId) return;

    const cachedTasks = this.storageService.tasksByTodoId().get(todoId) || [];
    const isCacheValid = this.storageService.isCacheValid(DEFAULT_CACHE_TTL_MS);

    if (cachedTasks.length > 0 && isCacheValid && !forceRefresh) {
      this.todoTasks.set(cachedTasks);
      this.taskPagination.update((p) => ({
        ...p,
        skip: cachedTasks.length,
        total: cachedTasks.length,
        hasMore: false,
        loading: false,
      }));
      return;
    }

    this.requestService
      .loadPage<Task>("tasks", {
        filter: { todo_id: todoId },
        visibility: (this.todo()?.visibility || "private") as Visibility,
        skip: 0,
        limit: 10,
      })
      .subscribe({
        next: (tasks: Task[]) => {
          this.todoTasks.set(tasks);
          this.taskPagination.update((p) => ({
            ...p,
            skip: tasks.length,
            total: tasks.length,
            hasMore: tasks.length === p.limit,
          }));
        },
        error: () => {
          this.taskPagination.update((p) => ({
            ...p,
            loading: false,
          }));
        },
      });
  }

  loadMoreTasks() {
    if (this.taskPagination().loading || !this.taskPagination().hasMore) return;

    const todoId = this.todoId();
    if (!todoId) return;

    this.requestService.loadMore<Task>("tasks").subscribe({
      next: (tasks: Task[]) => {
        this.todoTasks.update((current) => [...current, ...tasks]);
        this.taskPagination.update((p) => ({
          ...p,
          skip: p.skip + tasks.length,
          loading: false,
          hasMore: tasks.length === p.limit,
        }));
      },
      error: () => {
        this.taskPagination.update((p) => ({
          ...p,
          loading: false,
          hasMore: false,
        }));
      },
    });
  }

  listTasks = computed(() => {
    return this.filtersHelper.listTasks(this.todoTasks(), this.searchQuery());
  });

  getTaskUnreadCommentsCount(task: Task): number {
    const userId = this.authService.getValueByKey("id");
    if (!userId) return 0;

    const currentChats = this.chats();
    if (currentChats.length === 0) return 0;

    let count = 0;
    const taskSubtasks = this.getTaskSubtasks(task.id);
    for (const _subtask of taskSubtasks) {
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
    return this.storageService.subtasksByTaskId().get(taskId) || [];
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
        modes: ["card", "grid", "table", "kanban"],
      },
      filterFields: this.filtersHelper.filterFields,
      showFilter: this.showFilter(),
      onFiltersChange: (filters) => this.filtersHelper.onFiltersChange(filters),
    };
  }

  taskTableFields: TableField[] = [
    { key: "title", label: "Task", type: "text", sortable: true },
    { key: "priority", label: "Priority", type: "priority", sortable: true },
    { key: "status", label: "Status", type: "status", onClick: (item) => this.cycleStatus(item) },
    {
      key: "subtasks",
      label: "Subtasks",
      type: "number",
      getValue: (item) => item.subtasks_count || 0,
    },
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
          this.commentsHelper["_highlightCommentId"].set(queryParams.highlightCommentId);
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
    } else {
      const todoId = this.route.snapshot.paramMap.get("todoId") || routeData?.["todo"]?.id;
      if (todoId) {
        this.todoId.set(todoId);
        this.loadInitialTodo(todoId);
      }
    }

    this.loading.set(false);

    const filterSub = this.shortcutService.filter$.subscribe(() => {
      this.toggleFilter();
    });
    this.subscriptions.add(filterSub);
  }

  toggleTaskCompletion(task: Task): void {
    this.actionsHelper.toggleTaskCompletion(
      task,
      this.todo(),
      (fn) => this.todoTasks.update(fn),
      (dependsOn) => this.checkDependenciesCompleted(dependsOn)
    );
  }

  cycleStatus(task: Task) {
    this.toggleTaskCompletion(task);
  }

  onTaskStatusToggle(status: TaskStatus): void {
    const taskId = this.lastSelectedId();
    if (!taskId) return;

    const task = this.todoTasks().find((t) => t.id === taskId);
    if (!task) return;

    const todo = this.todo();
    if (!todo) return;

    this.requestService
      .update<Task>(
        "tasks",
        task.id,
        { ...task, status },
        { visibility: (todo.visibility || "private") as Visibility, offline: true }
      )
      .subscribe({
        next: () => {
          this.todoTasks.update((tasks) =>
            tasks.map((t) => (t.id === task.id ? { ...t, status } : t))
          );
        },
        error: () => {
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
    const parentTask = this.todoTasks().find((t) => t.id === subtask.task_id);
    if (!parentTask) {
      this.notifyService.showError("Parent task not found");
      return;
    }

    const todo = this.todo();
    if (!todo) {
      this.notifyService.showError("Parent todo not found");
      return;
    }

    const newStatus = BaseItemHelper.getNextStatus(subtask.status);

    this.requestService
      .update<Subtask>(
        "subtasks",
        subtask.id,
        { status: newStatus },
        { visibility: (todo.visibility || "private") as Visibility }
      )
      .subscribe({
        next: () => {},
        error: () => {
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

    this.requestService
      .create<Task>("tasks", nextTask, {
        visibility: (todo?.visibility || "private") as Visibility,
      })
      .subscribe({
        next: () => {
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
    const todo = this.todo();
    if (!todo) return;

    this.requestService
      .update<Task>(
        "tasks",
        event.task.id,
        { [event.field]: event.value },
        { visibility: (todo.visibility || "private") as Visibility }
      )
      .subscribe({
        next: () => {},
        error: () => {
          this.notifyService.showError("Failed to update task");
        },
      });
  }

  onRowClick(event: { event: MouseEvent; item: any } | any): void {
    const task = event.item || event;
    const mouseEvent = event.event;

    if (mouseEvent?.shiftKey) {
      const anchorId = this.lastSelectedId();
      if (anchorId) {
        this.selectRange(anchorId, task.id, this.listTasks());
        return;
      }
    } else if (mouseEvent?.ctrlKey || mouseEvent?.metaKey) {
      this.toggleItemSelection(task.id);
      this.lastSelectedId.set(task.id);
      return;
    }

    this.lastSelectedId.set(task.id);
    this.router.navigate([task.id, "subtasks"], { relativeTo: this.route });
  }

  onCardClick(event: { event: MouseEvent; id: string }): void {
    if (event.event.shiftKey) {
      const anchorId = this.lastSelectedId();
      if (anchorId) {
        this.selectRange(anchorId, event.id, this.listTasks());
        return;
      }
    } else if (event.event.ctrlKey || event.event.metaKey) {
      this.toggleItemSelection(event.id);
      this.lastSelectedId.set(event.id);
      return;
    }

    this.lastSelectedId.set(event.id);
    this.router.navigate([event.id, "subtasks"], { relativeTo: this.route });
  }

  onRangeSelect(event: { anchorId: string; targetId: string }): void {
    this.selectRange(event.anchorId, event.targetId, this.listTasks());
  }

  onAdditiveSelect(id: string): void {
    this.toggleItemSelection(id);
    this.lastSelectedId.set(id);
  }

  getTaskTableActions(): TableFieldActionButton[] {
    return this.actionsHelper.getTaskTableActions(this.todo());
  }

  getTaskCardActions() {
    return this.actionsHelper.getTaskCardActions();
  }

  onTaskTableAction(event: { action: string; item: Task }): void {
    this.actionsHelper.onTaskTableAction(
      event,
      this.todo(),
      (fn) => this.todoTasks.update(fn),
      (dependsOn) => this.checkDependenciesCompleted(dependsOn),
      this.router,
      this.route,
      () => this.isOwner(),
      () => this.isPrivate(),
      (taskId) => this.deleteTask(taskId),
      (taskId) => this.archiveTask(taskId),
      (task) => this.createOrUpdateGithubIssueFromTask(task)
    );
  }

  onTaskItemAction(event: { action: string; item: Task }): void {
    this.onTaskTableAction(event);
  }

  private createOrUpdateGithubIssueFromTask(task: Task): void {
    this.actionsHelper.createOrUpdateGithubIssueFromTask(task, this.todo());
  }

  onCommentToggle(taskId?: string): void {
    this.commentsHelper.onCommentToggle(taskId);
  }

  onTaskCommentAdd(event: { content: string; itemId: string }): void {
    this.commentsHelper.onTaskCommentAdd(event);
  }

  onTaskCommentDelete(commentId: string): void {
    this.commentsHelper.onTaskCommentDelete(commentId);
    this.requestService.delete("comments", commentId).subscribe();
  }

  onTaskCommentMarkAsRead(commentIds: string[]): void {
    this.commentsHelper.onTaskCommentMarkAsRead(commentIds);
  }

  onTaskSubtaskCommentAdd(event: { content: string; subtask_id: string; itemId: string }): void {
    this.commentsHelper.onTaskSubtaskCommentAdd(event);
  }

  async deleteTask(taskId?: string) {
    await this.actionsHelper.deleteTask(taskId!, this.todoId(), (fn) => this.todoTasks.update(fn));
  }

  async archiveTask(taskId?: string) {
    await this.actionsHelper.archiveTask(
      taskId!,
      this.todoId(),
      this.todo(),
      (fn) => this.todoTasks.update(fn),
      () => this.isOffline()
    );
  }

  ngAfterViewInit(): void {
    if (!this.taskPlaceholder?.element?.nativeElement) return;
    const el = this.taskPlaceholder.element.nativeElement as HTMLElement;
    el.style.display = "none";
    el.parentNode?.removeChild(el);
  }

  onTaskListEntered(event: CdkDragEnter): void {
    this.dragDropHandlerService.onListEntered(event, this.taskPlaceholder);
  }

  onTaskListDropped(): void {
    this.dragDropHandlerService.onListDropped(
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
          .handleDrop(syntheticEvent, this.listTasks(), "tasks", "tasks", todoId, this.isPrivate())
          .subscribe({
            next: (updatedTasks) => {
              if (updatedTasks && Array.isArray(updatedTasks)) {
                this.todoTasks.update((current) => {
                  const updatedMap = new Map(updatedTasks.map((t) => [t.id, t]));
                  return current.map((task) => updatedMap.get(task.id) || task);
                });
              }
            },
            error: () => {
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
      .handleDrop(event, this.listTasks(), "tasks", "tasks", todoId, this.isPrivate())
      .subscribe({
        next: (updatedTasks) => {
          if (updatedTasks && Array.isArray(updatedTasks)) {
            this.todoTasks.update((current) => {
              const updatedMap = new Map(updatedTasks.map((t) => [t.id, t]));
              return current.map((task) => updatedMap.get(task.id) || task);
            });
          }
        },
        error: () => {
          this.notifyService.showError("Failed to drop task");
        },
      });
  }

  toggleTaskSelection(event: { id: string; selected: boolean }) {
    const { id, selected } = event;
    if (selected) {
      this.lastSelectedId.set(id);
    }
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

  onTableSelectAll(selectAll: boolean): void {
    this.selectedTasks.update((taskIds) => {
      const newSelected = new Set(taskIds);
      if (selectAll) {
        this.listTasks().forEach((task) => newSelected.add(task.id));
      } else {
        this.listTasks().forEach((task) => newSelected.delete(task.id));
      }
      return newSelected;
    });
  }

  bulkUpdatePriority(priority: string) {
    this.actionsHelper.bulkUpdatePriority(
      this.selectedTasks(),
      priority,
      () => this.clearSelection(),
      (msg) => this.notifyService.showSuccess(msg),
      (id, data) => this.requestService.update<Task>("tasks", id, data)
    );
  }

  async bulkUpdateStatus(status: string) {
    await this.actionsHelper.bulkUpdateStatus(
      this.selectedTasks(),
      status,
      this.todo(),
      () => this.clearSelection(),
      (msg) => {
        if (msg.includes("failed")) {
          this.notifyService.showWarning(msg);
        } else {
          this.notifyService.showSuccess(msg);
        }
      },
      (id, data, options) => this.requestService.update<Task>("tasks", id, data, options)
    );
  }

  async bulkDelete(): Promise<void> {
    await this.actionsHelper.bulkDelete(
      this.selectedTasks(),
      () => this.clearSelection(),
      (msg) => {
        if (msg.includes("failed")) {
          this.notifyService.showWarning(msg);
        } else {
          this.notifyService.showSuccess(msg);
        }
      },
      (id) => this.requestService.delete("tasks", id)
    );
  }

  async bulkArchive(): Promise<void> {
    await this.actionsHelper.bulkArchive(
      this.selectedTasks(),
      () => this.listTasks(),
      () => this.clearSelection(),
      (msg) => {
        if (msg.includes("failed")) {
          this.notifyService.showWarning(msg);
        } else {
          this.notifyService.showSuccess(msg);
        }
      },
      (forceRefresh) => this.loadInitialTasks(forceRefresh)
    );
  }

  async bulkRestoreTasks(selectedIds: string[]): Promise<void> {
    await this.actionsHelper.bulkRestoreTasks(
      selectedIds,
      () => this.clearSelection(),
      (msg) => {
        if (msg.includes("failed")) {
          this.notifyService.showWarning(msg);
        } else {
          this.notifyService.showSuccess(msg);
        }
      },
      (forceRefresh) => this.loadInitialTasks(forceRefresh)
    );
  }

  isAllSelectedArchivedTasks(): boolean {
    return this.actionsHelper.isAllSelectedArchivedTasks(this.selectedTasks(), () =>
      this.listTasks()
    );
  }

  async onBulkAction(actionId: string) {
    if (actionId === "delete") {
      await this.bulkDelete();
    } else {
      const val = await this.promptDialogService.prompt({
        title: `Enter new ${actionId}`,
        message: `Enter value for ${actionId}:`,
        required: true,
        validateFn: (v: string) => {
          if (!v.trim()) return "Value is required";
          return null;
        },
      });
      if (val) {
        actionId === "priority" ? this.bulkUpdatePriority(val) : await this.bulkUpdateStatus(val);
      }
    }
  }

  resolveTodoTitle(todoId: string): string {
    const todo = this.storageService.todoMap().get(todoId);
    return todo?.title || "-";
  }

  getKanbanColumns() {
    return this.kanbanHelper.getKanbanColumns();
  }

  getColumnColorClass = this.kanbanHelper.getColumnColorClass;

  getTasksByStatus(status: TaskStatus): Task[] {
    return this.kanbanHelper.getTasksByStatus(this.listTasks(), status);
  }

  getConnectedKanbanDropLists(currentStatus: TaskStatus): string[] {
    return this.kanbanHelper.getConnectedKanbanDropLists(currentStatus);
  }

  onKanbanTaskDrop(event: CdkDragDrop<Task[]>, targetStatus: TaskStatus): void {
    this.kanbanHelper.onKanbanTaskDrop(event, targetStatus, this.todo(), (taskId, newStatus) =>
      this.updateTaskStatus(taskId, newStatus)
    );
  }

  private updateTaskStatus(taskId: string, newStatus: TaskStatus): void {
    this.kanbanHelper.updateTaskStatus(taskId, newStatus, this.todo(), (fn) =>
      this.todoTasks.update(fn)
    );
  }

  onKanbanStatusCycle(task: Task): void {
    this.kanbanHelper.onKanbanStatusCycle(task, (taskId, newStatus) =>
      this.updateTaskStatus(taskId, newStatus)
    );
  }

  onKanbanTaskClick(task: Task): void {
    this.kanbanHelper.onKanbanTaskClick(task, this.router, this.route);
  }

  onKanbanSelectionChange(taskId: string, isSelected: boolean): void {
    this.kanbanHelper.onKanbanSelectionChange(taskId, isSelected, (event) =>
      this.toggleTaskSelection(event)
    );
  }

  isKanbanTaskSelected(taskId: string): boolean {
    return this.kanbanHelper.isKanbanTaskSelected(taskId, this.selectedTasks());
  }
}
