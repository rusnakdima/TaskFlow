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
  HostListener,
  NO_ERRORS_SCHEMA,
} from "@angular/core";
import { ActivatedRoute, RouterModule, NavigationEnd, Router } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { CdkDragDrop, CdkDragEnter, CdkDropList, DragDropModule } from "@angular/cdk/drag-drop";
import { firstValueFrom } from "rxjs";
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
import { AdminService } from "@services/data/admin.service";
import { ResponseStatus } from "@models/response.model";
import { AppStateService } from "@services/core/app-state.service";
import { DragDropHandlerService } from "@services/ui/drag-drop-handler.service";
import { ConfirmDialogService } from "@services/core/confirm-dialog.service";
import { PromptDialogService } from "@services/core/prompt-dialog.service";

/* helpers */
import { BaseItemHelper } from "@helpers/base-item.helper";
import { FilteredListHelper } from "@helpers/filtered-list.helper";
import { BulkActionHelper, BulkOperationResult } from "@helpers/bulk-action.helper";
import { DEFAULT_CACHE_TTL_MS } from "@helpers/index";

/* views */
import { BaseListView } from "@views/base-list.view";

/* components */
import { TodoInformationComponent } from "@components/todo-information/todo-information.component";
import { ChatWindowComponent } from "@components/chat-window/chat-window.component";
import { BulkActionsComponent } from "@components/bulk-actions/bulk-actions.component";
import { TableViewComponent } from "@components/table-view/table-view.component";
import { TableField, TableFieldActionButton } from "@models/table-field.model";
import { GithubService } from "@services/github/github.service";
import { CommentService } from "@services/features/comment.service";
import { EmptyStateComponent } from "@components/empty-state/empty-state.component";
import {
  PageToolbarComponent,
  PageToolbarConfig,
} from "@components/page-toolbar/page-toolbar.component";
import { FilterField } from "@models/filter-config.model";
import { ItemExpandDetailsComponent } from "@components/item-expand-details/item-expand-details.component";
import { LoadingStateComponent } from "@components/loading-state/loading-state.component";
import { ChatFabComponent } from "@components/chat-fab/chat-fab.component";
import { TABLE_ACTIONS } from "@constants/table-field.constants";
import { ItemDisplayComponent } from "@components/item-display/item-display.component";
import { TASK_CARD_CONFIG } from "@constants/item-display.constants";

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
    ItemDisplayComponent,
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
  private bulkActionHelper = inject(BulkActionHelper);
  public bulkService = inject(BulkActionService);
  private adminService = inject(AdminService);
  private confirmDialogService = inject(ConfirmDialogService);
  private promptDialogService = inject(PromptDialogService);

  private appStateService = inject(AppStateService);
  private githubService = inject(GithubService);
  private commentService = inject(CommentService);

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

  taskCardConfig = TASK_CARD_CONFIG;
  taskActions = [TABLE_ACTIONS.EDIT, TABLE_ACTIONS.ARCHIVE];

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
          if (tasks.length > 0) {
            const taskIds = tasks.map((t) => t.id);
            this.loadCommentsForTasks(taskIds);
          }
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
    return FilteredListHelper.filterAndSort(this.todoTasks(), {
      filter: this.activeFilter(),
      query: this.searchQuery(),
      filterType: "status",
    });
  });

  private loadCommentsForTasks(taskIds: string[]): void {
    if (taskIds.length === 0) return;
    this.requestService
      .loadPage("comments", {
        filter: { task_id: { $in: taskIds } },
        visibility: (this.todo()?.visibility || "private") as Visibility,
        skip: 0,
        limit: 100,
      })
      .subscribe();
  }

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
    } else {
      const todoId = this.route.snapshot.paramMap.get("todoId") || routeData?.["todo"]?.id;
      if (todoId) {
        this.todoId.set(todoId);
        this.loadInitialTodo(todoId);
      }
    }

    this.loading.set(false);
  }

  toggleTaskCompletion(task: Task) {
    const todo = this.todo();
    if (!todo) return;

    if (
      task.status === TaskStatus.PENDING &&
      !this.checkDependenciesCompleted(task.depends_on || [])
    ) {
      this.notifyService.showError("Cannot complete task: waiting for dependencies");
      return;
    }

    const newStatus = BaseItemHelper.getNextStatus(task.status);

    this.requestService
      .update<Task>(
        "tasks",
        task.id,
        { ...task, status: newStatus },
        { visibility: (todo.visibility || "private") as Visibility, offline: true }
      )
      .subscribe({
        next: () => {
          this.todoTasks.update((tasks) =>
            tasks.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t))
          );
        },
        error: (err) => {
          console.error("Update task status failed:", err);
          this.notifyService.showError("Failed to update task status");
        },
      });
  }

  cycleStatus(task: Task) {
    this.toggleTaskCompletion(task);
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
        error: (err) => {
          console.error("Update task failed:", err);
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
    const actions: TableFieldActionButton[] = [TABLE_ACTIONS.EDIT, TABLE_ACTIONS.ARCHIVE];

    const currentTodo = this.todo();
    if (currentTodo?.github_repo_name) {
      actions.unshift(TABLE_ACTIONS.GITHUB_ISSUE);
    }

    return actions;
  }

  getTaskCardActions() {
    return this.taskActions;
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
      case "archive":
        this.archiveTask(event.item.id);
        break;
      case "toggle":
      case "toggle_status":
        this.toggleTaskCompletion(event.item);
        break;
      case "github_issue":
        this.createOrUpdateGithubIssueFromTask(event.item);
        break;
    }
  }

  onTaskItemAction(event: { action: string; item: Task }): void {
    this.onTaskTableAction(event);
  }

  private createOrUpdateGithubIssueFromTask(task: Task): void {
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

    if (task.github_issue_id) {
      this.githubService
        .updateIssue(owner, repo, task.github_issue_number!, task.title, issueBody)
        .subscribe({
          next: (result) => {
            this.notifyService.showSuccess("GitHub issue updated");
            this.requestService
              .update<Task>("tasks", task.id, {
                github_issue_url: result.html_url,
              })
              .subscribe();
          },
          error: (err) => {
            this.notifyService.showError("Failed to update GitHub issue: " + (err.message || err));
          },
        });
    } else if (task.publish_to_github) {
      this.githubService.createIssue(owner, repo, task.title, issueBody).subscribe({
        next: (result) => {
          this.notifyService.showSuccess(`GitHub issue created: ${result.html_url}`);
          this.requestService
            .update<Task>("tasks", task.id, {
              github_issue_id: String(result.id),
              github_issue_number: result.number,
              github_issue_url: result.html_url,
            })
            .subscribe();
        },
        error: (err) => {
          this.notifyService.showError("Failed to create GitHub issue: " + (err.message || err));
        },
      });
    }
  }

  onCommentToggle(): void {
    this.highlightCommentId.set(null);
  }

  onTaskCommentAdd(event: { content: string; itemId: string }): void {
    if (!event.content.trim()) return;
    this.commentService.createComment(event.content, { taskId: event.itemId }).subscribe({
      next: (comment) => {
        this.storageService.addCommentToTask(comment, event.itemId);
      },
      error: (err) => {
        console.error("[TasksView] Failed to add comment:", err);
        this.notifyService.showError("Failed to add comment");
      },
    });
  }

  onTaskCommentDelete(commentId: string): void {
    this.storageService.removeCommentFromAll(commentId);
    this.requestService.delete("comments", commentId).subscribe();
  }

  onTaskCommentMarkAsRead(commentIds: string[]): void {
    const userId = this.authService.getValueByKey("id");
    if (userId) {
      this.commentService.markCommentsAsRead(commentIds, userId);
    }
  }

  onTaskSubtaskCommentAdd(event: { content: string; subtask_id: string; itemId: string }): void {
    if (!event.content.trim()) return;
    this.commentService.createComment(event.content, { subtaskId: event.subtask_id }).subscribe({
      next: (comment) => {
        this.storageService.addCommentToSubtask(comment, event.subtask_id);
      },
      error: (err) => {
        console.error("[TasksView] Failed to add subtask comment:", err);
        this.notifyService.showError("Failed to add comment");
      },
    });
  }

  async deleteTask(taskId?: string) {
    const todoId = this.todoId();
    if (!todoId || !taskId) return;

    const confirmed = await this.confirmDialogService.confirm({
      title: "Delete Task",
      message: "Are you sure you want to delete this task?",
      confirmText: "Delete",
      confirmClass: "bg-red-600 hover:bg-red-700",
    });
    if (!confirmed) return;

    this.requestService.delete("tasks", taskId).subscribe({
      next: () => {
        this.notifyService.showSuccess("Task deleted successfully");
        this.todoTasks.update((tasks) => tasks.filter((t) => t.id !== taskId));
      },
    });
  }

  async archiveTask(taskId?: string) {
    const todoId = this.todoId();
    if (!todoId || !taskId) return;

    const confirmed = await this.confirmDialogService.confirm({
      title: "Archive Task",
      message: "Are you sure you want to archive this task?",
      confirmText: "Archive",
      confirmClass: "bg-orange-600 hover:bg-orange-700",
    });
    if (!confirmed) return;

    if (this.isOffline()) {
      const response = await this.adminService.toggleDeleteStatusLocal("tasks", taskId);
      if (response.status === ResponseStatus.SUCCESS) {
        this.notifyService.showSuccess("Task archived successfully");
        this.todoTasks.update((tasks) => tasks.filter((t) => t.id !== taskId));
      } else {
        this.notifyService.showError(response.message || "Failed to archive task");
      }
      return;
    }

    const visibility = (this.todo()?.visibility || "private") as Visibility;
    this.requestService.delete("tasks", taskId, { visibility }).subscribe({
      next: () => {
        this.notifyService.showSuccess("Task archived successfully");
        this.todoTasks.update((tasks) => tasks.filter((t) => t.id !== taskId));
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
        error: (err) => {
          console.error("Task drop failed:", err);
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

  bulkUpdatePriority(priority: string) {
    const todoId = this.todoId();
    if (!todoId) return;

    const selectedIds: string[] = Array.from(this.selectedTasks());

    this.bulkActionHelper
      .bulkUpdateField(
        selectedIds.map((id) => ({ id })),
        "priority",
        priority,
        (id, data) => this.requestService.update<Task>("tasks", id, data)
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

    const visibility = this.todo()?.visibility || "private";

    const updatePromises = Array.from(selectedIds).map((id) => {
      return firstValueFrom(
        this.bulkActionHelper.bulkUpdateStatus([{ id, status: "" }], status, (_id, _data) => {
          return this.requestService.update<Task>(
            "tasks",
            id,
            { status: status as TaskStatus },
            { visibility: visibility as string as Visibility }
          );
        })
      );
    });

    Promise.all(updatePromises)
      .then(() => {
        this.clearSelection();
        this.notifyService.showSuccess(`${selectedIds.length} task(s) updated`);
      })
      .catch(() => {
        this.notifyService.showError("Failed to update tasks");
      });
  }

  async bulkDelete(): Promise<void> {
    const todoId = this.todoId();
    if (!todoId) return;

    const selectedIds: string[] = Array.from(this.selectedTasks());
    if (selectedIds.length === 0) return;

    const confirmed = await this.confirmDialogService.confirm({
      title: "Delete Tasks",
      message: `Are you sure you want to delete ${selectedIds.length} task(s)?`,
      confirmText: "Delete",
    });
    if (!confirmed) return;

    this.bulkActionHelper
      .bulkDelete(
        selectedIds.map((id) => ({ id })),
        (id) => this.requestService.delete("tasks", id)
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

  async bulkArchive(): Promise<void> {
    const todoId = this.todoId();
    if (!todoId) return;

    const selectedIds: string[] = Array.from(this.selectedTasks());
    if (selectedIds.length === 0) return;

    const allTasks = this.listTasks();
    const allSelected = allTasks.filter((t) => selectedIds.includes(t.id));
    const allArchived = allSelected.every((t) => t.deleted_at);

    if (allArchived) {
      await this.bulkRestoreTasks(selectedIds);
      return;
    }

    const confirmed = await this.confirmDialogService.confirm({
      title: "Archive Tasks",
      message: `Are you sure you want to archive ${selectedIds.length} task(s)?`,
      confirmText: "Archive All",
      confirmClass: "bg-orange-600 hover:bg-orange-700",
    });
    if (!confirmed) return;

    let successCount = 0;
    let errorCount = 0;

    if (this.isOffline()) {
      for (const taskId of selectedIds) {
        const response = await this.adminService.toggleDeleteStatusLocal("tasks", taskId);
        if (response.status === ResponseStatus.SUCCESS) {
          successCount++;
        } else {
          errorCount++;
        }
      }
    } else {
      for (const taskId of selectedIds) {
        const response = await this.adminService.toggleDeleteStatusLocal("tasks", taskId);
        if (response.status === ResponseStatus.SUCCESS) {
          successCount++;
        } else {
          errorCount++;
        }
      }
    }

    this.clearSelection();
    if (errorCount > 0) {
      this.notifyService.showWarning(`Archived ${successCount} tasks, ${errorCount} failed.`);
    } else {
      this.notifyService.showSuccess(`Archived ${successCount} tasks.`);
    }
    this.loadInitialTasks(true);
  }

  async bulkRestoreTasks(selectedIds: string[]): Promise<void> {
    const confirmed = await this.confirmDialogService.confirm({
      title: "Restore Tasks",
      message: `Are you sure you want to restore ${selectedIds.length} task(s)?`,
      confirmText: "Restore All",
      confirmClass: "bg-green-600 hover:bg-green-700",
    });
    if (!confirmed) return;

    let successCount = 0;
    let errorCount = 0;

    for (const taskId of selectedIds) {
      const response = await this.adminService.toggleDeleteStatusLocal("tasks", taskId);
      if (response.status === ResponseStatus.SUCCESS) {
        successCount++;
      } else {
        errorCount++;
      }
    }

    this.clearSelection();
    if (errorCount > 0) {
      this.notifyService.showWarning(`Restored ${successCount} tasks, ${errorCount} failed.`);
    } else {
      this.notifyService.showSuccess(`Restored ${successCount} tasks.`);
    }
    this.loadInitialTasks(true);
  }

  isAllSelectedArchivedTasks(): boolean {
    const selectedIds = Array.from(this.selectedTasks());
    if (selectedIds.length === 0) return false;
    const allTasks = this.listTasks();
    const allSelected = allTasks.filter((t) => selectedIds.includes(t.id));
    return allSelected.length > 0 && allSelected.every((t) => t.deleted_at);
  }

  async onBulkAction(actionId: string) {
    if (actionId === "delete") this.bulkDelete();
    else {
      const val = await this.promptDialogService.prompt({
        title: `Enter new ${actionId}`,
        message: `Enter value for ${actionId}:`,
        required: true,
        validateFn: (v) => {
          if (!v.trim()) return "Value is required";
          return null;
        },
      });
      if (val) actionId === "priority" ? this.bulkUpdatePriority(val) : this.bulkUpdateStatus(val);
    }
  }

  resolveTodoTitle(todoId: string): string {
    const todo = this.storageService.todoMap().get(todoId);
    return todo?.title || "-";
  }
}
