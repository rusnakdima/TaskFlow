import { Component, signal, computed, effect, inject, DestroyRef, ViewChild } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router, RouterModule, NavigationEnd } from "@angular/router";
import { CdkDragDrop, CdkDragEnter, CdkDropList, DragDropModule } from "@angular/cdk/drag-drop";
import { firstValueFrom, Subscription } from "rxjs";
import { filter, map } from "rxjs/operators";

import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";

import { BaseListView } from "@views/base-list.view";
import { AppStateService } from "@services/core/app-state.service";
import { ConfirmDialogService } from "@services/core/confirm-dialog.service";
import { BulkActionService } from "@services/bulk-action.service";
import { DragDropOrderService } from "@services/ui/drag-drop-order.service";
import { DragDropHandlerService } from "@services/ui/drag-drop-handler.service";
import { ApiService, Visibility } from "@services/api.service";
import { AdminService } from "@services/data/admin.service";
import { UnifiedSyncService } from "@services/sync/unified-sync.service";
import { ResponseStatus } from "@models/response.model";
import { BaseItemHelper } from "@helpers/base-item.helper";
import { FilteredListHelper } from "@helpers/filtered-list.helper";
import { Subtask } from "@models/generated/api.types";
import { Task, TaskStatus } from "@models/generated/api.types";
import { Todo } from "@models/generated/api.types";
import { Chat } from "@models/generated/api.types";
import { CommentService } from "@services/features/comment.service";
import { SubtasksKanbanHelper } from "@helpers/subtasks-kanban.helper";
import { PermissionService, TodoPermission } from "@services/core/permission.service";
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { SearchService } from "@services/core/search.service";

import { FilterField } from "@models/filter-config.model";
import { TableField, TableFieldActionButton } from "@models/table-field.model";
import { TABLE_ACTIONS } from "@constants/table-field.constants";

import { TaskInformationComponent } from "@components/task-information/task-information.component";
import {
  PageToolbarComponent,
  PageToolbarConfig,
} from "@components/page-toolbar/page-toolbar.component";
import { LoadingStateComponent } from "@components/loading-state/loading-state.component";
import { EmptyStateComponent } from "@components/empty-state/empty-state.component";
import { BulkActionsComponent } from "@components/bulk-actions/bulk-actions.component";
import { ItemCardComponent } from "@components/item-card/item-card.component";
import { ItemExpandDetailsComponent } from "@components/item-expand-details/item-expand-details.component";
import { TableViewComponent } from "@components/table-view/table-view.component";

import { KanbanSubtaskCardComponent } from "@components/kanban-subtask-card/kanban-subtask-card.component";
import { SUBTASK_CARD_CONFIG, SUBTASK_TABLE_CONFIG } from "@constants/item-display.constants";
import {
  PullToRefreshDirective,
  PullToRefreshIndicatorComponent,
} from "@components/pull-to-refresh";

interface QueryParams {
  highlightSubtask?: string;
  openComments?: string;
  highlightComment?: string;
}

@Component({
  selector: "app-subtasks",
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    MatProgressSpinnerModule,
    DragDropModule,
    TaskInformationComponent,
    PageToolbarComponent,
    LoadingStateComponent,
    EmptyStateComponent,
    BulkActionsComponent,
    ItemCardComponent,
    ItemExpandDetailsComponent,
    TableViewComponent,

    KanbanSubtaskCardComponent,
    PullToRefreshDirective,
    PullToRefreshIndicatorComponent,
  ],
  templateUrl: "./subtasks.view.html",
})
export class SubtasksViewComponent extends BaseListView {
  @ViewChild("subtaskPlaceholder", { read: CdkDropList })
  protected subtaskPlaceholder!: CdkDropList;

  protected getItems(): { id: string }[] {
    return this.listSubtasks();
  }

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private requestService = inject(ApiService);
  private apiService = inject(ApiService);
  private appStateService = inject(AppStateService);
  private confirmDialogService = inject(ConfirmDialogService);
  private bulkService = inject(BulkActionService);
  private dragDropService = inject(DragDropOrderService);
  private dragDropHandlerService = inject(DragDropHandlerService);
  private adminService = inject(AdminService);
  private destroyRef = inject(DestroyRef);
  private commentService = inject(CommentService);
  private permissionService = inject(PermissionService);
  private jwtTokenService = inject(JwtTokenService);

  kanbanHelper = inject(SubtasksKanbanHelper);
  private syncService = inject(UnifiedSyncService);
  private searchService = inject(SearchService);

  refreshState = signal<"idle" | "pulling" | "triggered" | "refreshing" | "complete">("idle");
  refreshDistance = signal(0);

  showMobileInfo = signal(false);
  showInfoBlock = computed(() => this.appStateService.showInfoBlock());
  todoId = signal("");
  projectTitle = signal("");
  chats = signal<Chat[]>([]);

  private chatSubscription?: Subscription;

  private readonly routeTaskId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get("taskId") ?? null)),
    { initialValue: this.route.snapshot.paramMap.get("taskId") ?? null }
  );

  task = signal<Task | null>(null);
  todo = signal<Todo | null>(null);
  visibilityParam = signal<Visibility>("private");

  private lastTaskIdForEffect: string | null = null;

  // @ts-ignore
  private _taskEffect = effect(() => {
    const taskId = this.routeTaskId() || this.route.snapshot.paramMap.get("taskId");
    if (taskId && taskId !== this.lastTaskIdForEffect) {
      this.lastTaskIdForEffect = taskId;
      this.loadTask(taskId);
    }
  });

  fromKanban = signal(false);
  highlightSubtask = signal<string | null>(null);
  highlightComment = signal<string | null>(null);
  openCommentsForSubtaskId = signal<string | null>(null);

  commentExpandedSubtasks = signal<Set<string>>(new Set());

  subtaskPagination = signal<{
    skip: number;
    limit: number;
    total: number;
    hasMore: boolean;
    loading: boolean;
  }>({ skip: 0, limit: 10, total: 0, hasMore: true, loading: false });

  taskSubtasks = signal<Subtask[]>([]);

  private isLoadingSubtasks = false;
  private lastLoadedTaskId: string | null = null;

  userId: string = "";
  userPermission = signal<TodoPermission>(TodoPermission.VIEWER);

  isOwner = computed(() => this.todo()?.user_id === this.userId);
  isPrivate = computed(() => this.todo()?.visibility === "private");

  canCreateSubtask = computed(() =>
    [TodoPermission.EDITOR, TodoPermission.MODERATOR, TodoPermission.OWNER].includes(
      this.userPermission()
    )
  );

  canEditSubtask(subtask: Subtask): boolean {
    return this.permissionService.canEditSubtask(subtask, this.userPermission(), this.userId);
  }

  canDeleteSubtask(subtask: Subtask): boolean {
    return this.permissionService.canDeleteSubtask(subtask, this.userPermission(), this.userId);
  }

  canArchiveSubtask(subtask: Subtask): boolean {
    return this.permissionService.canArchiveSubtask(subtask, this.userPermission(), this.userId);
  }

  listSubtasks = computed(() => {
    const query = this.searchQuery();
    if (query.trim()) {
      const searchResults = this.searchService.subtasksResults();
      if (searchResults.length > 0) {
        return FilteredListHelper.filterAndSort(searchResults, {
          filter: this.activeFilter(),
          query: "",
          filterType: "status",
        });
      }
    }
    return FilteredListHelper.filterAndSort(this.taskSubtasks(), {
      filter: this.activeFilter(),
      query: query,
      filterType: "status",
    });
  });

  override onSearchChange(query: string): void {
    super.onSearchChange(query);
    this.searchService.search("subtasks", query);
  }

  selectedSubtasks = () => this.selectedItems();

  subtaskCardConfig = SUBTASK_CARD_CONFIG;
  subtaskTableConfig = SUBTASK_TABLE_CONFIG;
  subtaskActions: TableFieldActionButton[] = [TABLE_ACTIONS.EDIT, TABLE_ACTIONS.ARCHIVE];

  getFilteredSubtaskActions(): TableFieldActionButton[] {
    return [TABLE_ACTIONS.EDIT, TABLE_ACTIONS.ARCHIVE];
  }

  subtaskTableFields: TableField[] = [
    { key: "title", label: "Subtask", type: "text", sortable: true },
    { key: "priority", label: "Priority", type: "priority", sortable: true },
    { key: "status", label: "Status", type: "status" },
  ];

  override isAllSelected(): boolean {
    return super.isAllSelected(() => this.listSubtasks());
  }

  private loadTask(taskId: string): void {
    const reactiveTask = this.storage.taskMap().get(taskId);
    if (reactiveTask) {
      this.task.set(reactiveTask);
      if (reactiveTask.todo_id) {
        this.loadTodo(reactiveTask.todo_id);
      }
      this.loadInitialSubtasks();
    } else {
      this.apiService.tasks.get(taskId).subscribe({
        next: (task) => {
          if (task) {
            this.storage.addEntity("tasks", task as any);
            this.task.set(task);
            if (task.todo_id) {
              this.loadTodo(task.todo_id);
            }
            this.loadInitialSubtasks();
          } else {
            this.notifyService.showError("Task not found. Please refresh.");
          }
        },
        error: () => {
          this.notifyService.showError("Task not found. Please refresh.");
        },
      });
    }
  }

  private loadTodo(todoId: string): void {
    const reactiveTodo = this.storage.todoMap().get(todoId);
    if (reactiveTodo) {
      this.todo.set(reactiveTodo);
      this.todoId.set(reactiveTodo.id);
      this.projectTitle.set(reactiveTodo.title);
      this.setUserPermission(reactiveTodo);
    } else {
      this.notifyService.showError("Todo not found.");
    }
  }

  private async setUserPermission(todo: Todo): Promise<void> {
    const userId = this.userId;
    if (todo.user_id === userId) {
      this.userPermission.set(TodoPermission.OWNER);
      return;
    }
    if ((todo as any).assignee_roles && (todo as any).assignee_roles[userId]) {
      this.userPermission.set(this.permissionService.fromStr((todo as any).assignee_roles[userId]));
      return;
    }
    if (!todo.assignees?.includes(userId)) {
      this.userPermission.set(TodoPermission.VIEWER);
      return;
    }
    if (todo.visibility === "public") {
      this.userPermission.set(TodoPermission.VIEWER);
      return;
    }
    const token = this.jwtTokenService.getToken() || "";
    const assigneeRoles = await this.permissionService.getTodoPermissionsAsync(
      todo.id,
      todo.visibility || "private",
      token
    );
    const role = assigneeRoles[userId] || "viewer";
    this.userPermission.set(this.permissionService.fromStr(role));
  }

  // @ts-ignore
  private _loadChats(todoId: string): void {
    this.chatSubscription?.unsubscribe();
    const visibility = this.todo()?.visibility || "private";
    const sub = this.requestService
      .loadPage<Chat>("chats", {
        filter: { todo_id: todoId },
        visibility: visibility as Visibility,
        skip: 0,
        limit: 10,
        load: ["user"],
      })
      .subscribe({
        next: (chats: Chat[]) => {
          this.chats.set(chats);
        },
      });
    this.chatSubscription = sub;
    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  loadInitialSubtasks(forceRefresh = false) {
    const taskId = this.task()?.id;
    const visibility = this.todo()?.visibility || "private";
    if (!taskId) return;

    if (!forceRefresh && this.isLoadingSubtasks && this.lastLoadedTaskId === taskId) return;

    this.isLoadingSubtasks = true;
    this.lastLoadedTaskId = taskId;

    this.subtaskPagination.update((p) => ({ ...p, loading: true }));

    this.requestService
      .loadPage<Subtask>("subtasks", {
        filter: { task_id: taskId },
        visibility: visibility as Visibility,
        skip: 0,
        limit: 10,
      })
      .subscribe({
        next: (subtasks: Subtask[]) => {
          this.taskSubtasks.set(subtasks);
          this.subtaskPagination.update((p) => ({
            ...p,
            skip: subtasks.length,
            loading: false,
            hasMore: subtasks.length === p.limit,
          }));
        },
        error: () => {
          this.subtaskPagination.update((p) => ({ ...p, loading: false }));
        },
        complete: () => {
          this.isLoadingSubtasks = false;
        },
      });
  }

  loadMoreSubtasks() {
    if (this.subtaskPagination().loading || !this.subtaskPagination().hasMore) return;
    const taskId = this.task()?.id;
    if (!taskId) return;
    this.storage.loadMoreSubtasks(taskId);
  }

  constructor() {
    super();
  }

  override ngOnInit(): void {
    super.ngOnInit();

    this.userId = this.authService.getValueByKey("id");
    this.pageKey = "subtasks";

    this.viewMode.set(this.loadViewModePreference());

    this.bulkService.setMode("subtasks");
    this.bulkService.updateTotalCount(0);

    this.subscriptions.add(
      this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
        this.clearSelection();
      })
    );

    this.subscriptions.add(
      this.route.queryParams.subscribe((queryParams: QueryParams) => {
        if ((queryParams as any).visibility) {
          this.visibilityParam.set((queryParams as any).visibility as Visibility);
        }
        if (queryParams.highlightSubtask) {
          const id = queryParams.highlightSubtask;
          this.highlightSubtask.set(id);
          if (queryParams.openComments) {
            this.openCommentsForSubtaskId.set(id);
          }
          super.handleHighlightQueryParams(queryParams, "highlightSubtask", "subtask-", () =>
            this.highlightSubtask.set(null)
          );
        }
        if (queryParams.highlightComment) {
          this.highlightComment.set(queryParams.highlightComment);
          this.openCommentsForSubtaskId.set("*");
        }
        if (
          !queryParams.openComments &&
          !queryParams.highlightSubtask &&
          !queryParams.highlightComment
        ) {
          this.openCommentsForSubtaskId.set(null);
        }
      })
    );

    const routeData = this.route.snapshot.data;
    if (routeData?.["task"]) {
      const resolvedData = routeData["task"];
      const todoData = resolvedData?.todo;
      const taskData = resolvedData?.task;
      if (todoData) {
        this.todoId.set(todoData.id);
        this.projectTitle.set(todoData.title);
        this.todo.set(todoData);
      }
      if (taskData) {
        this.task.set(taskData);
        this.loadInitialSubtasks();
      }
      this.loading.set(false);
    } else {
      const taskId = this.route.snapshot.paramMap.get("taskId");
      if (taskId) {
        const reactiveTask = this.storage.taskMap().get(taskId);
        if (reactiveTask) {
          this.task.set(reactiveTask);
          this.loadTodo(reactiveTask.todo_id);
          this.loadInitialSubtasks();
        } else {
          this.notifyService.showError("Task not found. Please refresh.");
        }
        this.loading.set(false);
      } else {
        this.notifyService.showError("Invalid task ID.");
        this.loading.set(false);
      }
    }

    this.subscriptions.add(
      this.shortcutService.filter$.subscribe(() => {
        this.toggleFilter();
      })
    );

    const refreshSub = this.shortcutService.refresh$.subscribe(() => {
      if (!this.authService.isLoggedIn()) {
        this.router.navigate(["/login"]);
        return;
      }
      this.refreshState.set("refreshing");
      this.syncService.refreshLocal().finally(() => {
        this.refreshState.set("idle");
      });
    });
    this.subscriptions.add(refreshSub);
  }

  onPullToRefresh(): Promise<void> {
    return this.syncService.syncAll() as unknown as Promise<void>;
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
        count: this.selectedSubtasks().size,
        highlight: this.selectedSubtasks().size > 0 && !this.isAllSelected(),
      },
      filter: {
        onToggle: () => this.toggleFilter(),
        isActive: this.showFilter(),
      },
      newButton: this.canCreateSubtask()
        ? {
            onClick: () =>
              this.router.navigate(["create_subtask"], {
                relativeTo: this.route,
                queryParams: { visibility: this.todo()?.visibility },
              }),
            label: "New Subtask",
            icon: "add",
          }
        : undefined,
      viewMode: {
        mode: this.viewMode(),
        pageKey: "subtasks",
        onModeChange: (mode) => this.setViewMode(mode),
        modes: ["card", "grid", "table", "list", "kanban"],
      },
      refresh: {
        onClick: () => {
          this.refreshState.set("refreshing");
          this.syncService.refreshLocal().finally(() => {
            this.refreshState.set("idle");
          });
          this.loadInitialSubtasks(true);
        },
        loading: this.refreshState() === "refreshing",
      },
      filterFields: this.filterFields,
      showFilter: this.showFilter(),
      onFiltersChange: (filters) => this.onFiltersChange(filters),
    };
  }

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

  onFiltersChange(filters: Record<string, string | string[] | any>): void {
    this._activeFilters.set(filters);
  }

  private _activeFilters = signal<Record<string, string | string[] | any>>({});

  getUnreadCountForSubtask(subtaskId: string): number {
    const userId = this.authService.getValueByKey("id");
    if (!userId) return 0;
    const comments = this.storage.commentsBySubtaskId().get(subtaskId) || [];
    return comments.filter(
      (c) => c.user_id !== userId && !(c.read_by && c.read_by.includes(userId))
    ).length;
  }

  toggleInfoBlock() {
    this.appStateService.toggleInfoBlock();
  }

  onRowClick(event: { event: MouseEvent; item: Subtask }): void {
    const subtask = event.item;
    const mouseEvent = event.event;

    if (mouseEvent?.shiftKey) {
      const anchorId = this.lastSelectedId();
      if (anchorId) {
        this.selectRange(anchorId, subtask.id, this.listSubtasks());
        return;
      }
    } else if (mouseEvent?.ctrlKey || mouseEvent?.metaKey) {
      this.toggleItemSelection(subtask.id);
      this.lastSelectedId.set(subtask.id);
      return;
    }

    this.lastSelectedId.set(subtask.id);
  }

  onCardClick(event: { event: MouseEvent; id: string }): void {
    if (event.event.shiftKey) {
      const anchorId = this.lastSelectedId();
      if (anchorId) {
        this.selectRange(anchorId, event.id, this.listSubtasks());
        return;
      }
    } else if (event.event.ctrlKey || event.event.metaKey) {
      this.toggleItemSelection(event.id);
      this.lastSelectedId.set(event.id);
      return;
    }

    this.lastSelectedId.set(event.id);
  }

  onRangeSelect(event: { anchorId: string; targetId: string }): void {
    this.selectRange(event.anchorId, event.targetId, this.listSubtasks());
  }

  onAdditiveSelect(id: string): void {
    this.toggleItemSelection(id);
    this.lastSelectedId.set(id);
  }

  toggleSubtaskCompletion(subtask: Subtask) {
    if (!this.canEditSubtask(subtask)) {
      this.notifyService.showError("You don't have permission to change subtask status");
      return;
    }
    const todo = this.todo();
    const visibility = todo?.visibility || "private";

    const newStatus = BaseItemHelper.getNextStatus(subtask.status);

    this.apiService.subtasks.update(subtask.id, { status: newStatus }, visibility).subscribe({
      next: () => {
        this.taskSubtasks.update((subtasks: Subtask[]) =>
          subtasks.map((s: Subtask) => (s.id === subtask.id ? { ...s, status: newStatus } : s))
        );
      },
      error: (err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to update subtask";
        this.notifyService.showError(message);
      },
    });
  }

  updateSubtaskInline(event: { subtask: Subtask; field: string; value: unknown }) {
    const todo = this.todo();
    const visibility = todo?.visibility || "private";

    this.apiService.subtasks
      .update(event.subtask.id, { [event.field]: event.value }, visibility)
      .subscribe({
        next: () => {},
        error: (err: unknown) => {
          const message = err instanceof Error ? err.message : "Failed to update subtask";
          this.notifyService.showError(message);
        },
      });
  }

  async deleteSubtask(id: string, visibility?: string) {
    const confirmed = await this.confirmDialogService.confirm({
      title: "Delete Subtask",
      message: "Are you sure you want to delete this subtask?",
      confirmText: "Delete",
      confirmClass: "bg-red-600 hover:bg-red-700",
    });
    if (!confirmed) return;

    this.apiService.subtasks.delete(id, { visibility }).subscribe({
      next: () => {
        this.notifyService.showSuccess("Subtask deleted successfully");
      },
      error: (err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to delete subtask";
        this.notifyService.showError(message);
      },
    });
  }

  onSubtaskDrop(event: CdkDragDrop<Subtask[]>): void {
    const taskId = this.task()?.id;
    if (!taskId) return;

    this.dragDropService
      .handleDrop(event, this.listSubtasks(), "subtasks", "subtasks", taskId, this.isPrivate())
      .subscribe({
        next: (updatedSubtasks) => {
          if (updatedSubtasks && Array.isArray(updatedSubtasks)) {
            this.taskSubtasks.update((current) => {
              const updatedMap = new Map(updatedSubtasks.map((s) => [s.id, s]));
              return current.map((subtask) => updatedMap.get(subtask.id) || subtask);
            });
          }
        },
        error: () => {
          this.notifyService.showError("Failed to reorder subtasks");
        },
      });
  }

  onSubtaskListEntered(event: CdkDragEnter): void {
    this.dragDropHandlerService.onListEntered(event, this.subtaskPlaceholder);
  }

  onSubtaskListDropped(_event: CdkDragDrop<Subtask[]>): void {
    this.dragDropHandlerService.onListDropped(
      this.subtaskPlaceholder,
      (prev: number, curr: number) => {
        if (prev === curr) return;

        const taskId = this.task()?.id;
        if (!taskId) return;

        const syntheticEvent = {
          previousIndex: prev,
          currentIndex: curr,
          item: null,
          container: null,
          previousContainer: null,
          distance: { x: 0, y: 0 },
        } as unknown as CdkDragDrop<Subtask[]>;

        this.dragDropService
          .handleDrop(
            syntheticEvent,
            this.listSubtasks(),
            "subtasks",
            "subtasks",
            taskId,
            this.isPrivate()
          )
          .subscribe({
            next: (updatedSubtasks) => {
              if (updatedSubtasks && Array.isArray(updatedSubtasks)) {
                this.taskSubtasks.update((current) => {
                  const updatedMap = new Map(updatedSubtasks.map((s) => [s.id, s]));
                  return current.map((subtask) => updatedMap.get(subtask.id) || subtask);
                });
              }
            },
            error: () => {
              this.notifyService.showError("Failed to reorder subtasks");
            },
          });
      }
    );
  }

  toggleSubtaskSelection(event: { id: string; selected: boolean }): void {
    const { id, selected } = event;
    if (selected) {
      this.lastSelectedId.set(id);
    }
    this.selectedItems.update((subtaskIds) => {
      const newSelected = new Set(subtaskIds);
      if (selected) {
        newSelected.add(id);
      } else {
        newSelected.delete(id);
      }
      this.bulkService.setSelectionState(newSelected.size, this.isAllSelected());
      return newSelected;
    });
  }

  onTableSelectAll(selectAll: boolean): void {
    this.selectedItems.update((subtaskIds) => {
      const newSelected = new Set(subtaskIds);
      if (selectAll) {
        this.listSubtasks().forEach((subtask) => newSelected.add(subtask.id));
      } else {
        this.listSubtasks().forEach((subtask) => newSelected.delete(subtask.id));
      }
      this.bulkService.setSelectionState(newSelected.size, selectAll);
      return newSelected;
    });
  }

  bulkUpdateStatus(status: string): void {
    const selected = this.selectedSubtasks();
    if (selected.size === 0) return;

    const visibility = this.isPrivate() ? "private" : "shared";
    const updatePromises = Array.from(selected).map((subtaskId) => {
      return firstValueFrom(
        this.apiService.subtasks.update(subtaskId, { status: status as any }, visibility)
      );
    });

    Promise.all(updatePromises)
      .then((_results) => {
        this.notifyService.showSuccess(`${selected.size} subtask(s) updated`);
        this.clearSelection();
      })
      .catch((err) => {
        this.notifyService.showError(String(err) || "Failed to update subtasks");
      });
  }

  async bulkArchive(): Promise<void> {
    const permission = this.userPermission();
    if (permission === TodoPermission.VIEWER) {
      this.notifyService.showError("You don't have permission to archive subtasks");
      return;
    }
    if ([TodoPermission.MODERATOR, TodoPermission.OWNER].includes(permission)) {
      // Allow bulk archive
    } else {
      // EDITOR - check ownership of each selected subtask
      const allSubtasks = this.listSubtasks();
      const selectedIds = Array.from(this.selectedSubtasks());
      const allSelected = allSubtasks.filter((s) => selectedIds.includes(s.id));
      const ownedCount = allSelected.filter((s) => s.user_id === this.userId).length;
      if (ownedCount !== allSelected.length) {
        this.notifyService.showError("You can only archive subtasks you created");
        return;
      }
    }
    const selected = this.selectedSubtasks();
    if (selected.size === 0) return;

    const allSubtasks = this.listSubtasks();
    const selectedIds = Array.from(selected);
    const allSelected = allSubtasks.filter((s) => selectedIds.includes(s.id));
    const allArchived = allSelected.every((s) => s.deleted_at);

    if (allArchived) {
      await this.bulkRestoreSubtasks(selectedIds);
      return;
    }

    const confirmed = await this.confirmDialogService.confirm({
      title: "Archive Subtasks",
      message: `Are you sure you want to archive ${selected.size} subtask(s)?`,
      confirmText: "Archive All",
      confirmClass: "bg-orange-600 hover:bg-orange-700",
    });
    if (!confirmed) return;

    let successCount = 0;
    let errorCount = 0;

    for (const id of selected) {
      const response = await this.adminService.toggleDeleteStatusLocal("subtasks", id);
      if (response.status === ResponseStatus.SUCCESS) {
        successCount++;
      } else {
        errorCount++;
      }
    }

    if (errorCount > 0) {
      this.notifyService.showWarning(`Archived ${successCount} subtask(s), ${errorCount} failed.`);
    } else {
      this.notifyService.showSuccess(`${successCount} subtask(s) archived successfully`);
    }
    this.clearSelection();
    this.loadInitialSubtasks(true);
  }

  async bulkRestoreSubtasks(selectedIds: string[]): Promise<void> {
    const confirmed = await this.confirmDialogService.confirm({
      title: "Restore Subtasks",
      message: `Are you sure you want to restore ${selectedIds.length} subtask(s)?`,
      confirmText: "Restore All",
      confirmClass: "bg-green-600 hover:bg-green-700",
    });
    if (!confirmed) return;

    let successCount = 0;
    let errorCount = 0;

    for (const id of selectedIds) {
      const response = await this.adminService.toggleDeleteStatusLocal("subtasks", id);
      if (response.status === ResponseStatus.SUCCESS) {
        successCount++;
      } else {
        errorCount++;
      }
    }

    if (errorCount > 0) {
      this.notifyService.showWarning(`Restored ${successCount} subtask(s), ${errorCount} failed.`);
    } else {
      this.notifyService.showSuccess(`${successCount} subtask(s) restored successfully`);
    }
    this.clearSelection();
    this.loadInitialSubtasks(true);
  }

  isAllSelectedArchivedSubtasks(): boolean {
    const selectedIds = Array.from(this.selectedSubtasks());
    if (selectedIds.length === 0) return false;
    const allSubtasks = this.listSubtasks();
    const allSelected = allSubtasks.filter((s) => selectedIds.includes(s.id));
    return allSelected.length > 0 && allSelected.every((s) => s.deleted_at);
  }

  onSubtaskTableAction(event: { action: string; item: Subtask }): void {
    switch (event.action) {
      case "edit":
        this.router.navigate([event.item.id, "edit_subtask"], {
          relativeTo: this.route,
          queryParams: { visibility: this.todo()?.visibility },
        });
        break;
      case "delete":
        if (!this.canDeleteSubtask(event.item)) {
          this.notifyService.showError("You don't have permission to delete this subtask");
          return;
        }
        this.deleteSubtask(event.item.id, this.todo()?.visibility);
        break;
      case "archive":
        if (!this.canArchiveSubtask(event.item)) {
          this.notifyService.showError("You don't have permission to archive this subtask");
          return;
        }
        this.archiveSubtask(event.item.id, this.todo()?.visibility);
        break;
      case "toggle_status":
        this.toggleSubtaskCompletion(event.item);
        break;
    }
  }

  onSubtaskCommentAdd(event: { content: string; itemId: string }): void {
    if (!event.content.trim()) return;
    if (this.userPermission() === TodoPermission.VIEWER) {
      this.notifyService.showError("Viewers cannot add comments");
      return;
    }
    const subtask_id = event.itemId;
    this.commentService.createComment(event.content, { subtaskId: subtask_id }).subscribe({
      next: (comment) => {
        this.storage.addEntity("comments", comment);
      },
      error: () => {
        this.notifyService.showError("Failed to add comment");
      },
    });
  }

  onSubtaskCommentDelete(commentId: string): void {
    this.storage.removeEntity("comments", commentId);
    this.apiService.comments.delete(commentId).subscribe();
  }

  onSubtaskCommentMarkAsRead(commentIds: string[]): void {
    const userId = this.authService.getValueByKey("id");
    if (userId) {
      this.commentService.markCommentsAsRead(commentIds, userId);
    }
  }

  onSubtaskItemAction(event: { action: string; item: Subtask }): void {
    switch (event.action) {
      case "toggle":
      case "toggle_status":
        this.toggleSubtaskCompletion(event.item);
        break;
      case "delete":
        if (!this.canDeleteSubtask(event.item)) {
          this.notifyService.showError("You don't have permission to delete this subtask");
          return;
        }
        this.deleteSubtask(event.item.id, this.todo()?.visibility);
        break;
      case "edit":
        this.router.navigate([event.item.id, "edit_subtask"], {
          relativeTo: this.route,
          queryParams: { visibility: this.todo()?.visibility },
        });
        break;
      case "archive":
        if (!this.canArchiveSubtask(event.item)) {
          this.notifyService.showError("You don't have permission to archive this subtask");
          return;
        }
        this.archiveSubtask(event.item.id, this.todo()?.visibility);
        break;
    }
  }

  onSubtaskStatusToggle(payload: { item: Subtask; status: TaskStatus }): void {
    if (!this.canEditSubtask(payload.item)) {
      this.notifyService.showError("You don't have permission to change subtask status");
      return;
    }
    const todo = this.todo();
    const visibility = todo?.visibility || "private";

    this.apiService.subtasks
      .update(payload.item.id, { status: payload.status }, visibility)
      .subscribe({
        next: () => {
          this.taskSubtasks.update((subtasks: Subtask[]) =>
            subtasks.map((s: Subtask) =>
              s.id === payload.item.id ? { ...s, status: payload.status } : s
            )
          );
        },
        error: (err: unknown) => {
          const message = err instanceof Error ? err.message : "Failed to update subtask";
          this.notifyService.showError(message);
        },
      });
  }

  onSubtaskCommentToggle(subtaskId: string): void {
    this.storage.ensureCommentsLoaded(undefined, this.todo()?.visibility || "private");
    this.commentExpandedSubtasks.update((set) => {
      const newSet = new Set(set);
      if (newSet.has(subtaskId)) {
        newSet.delete(subtaskId);
      } else {
        newSet.add(subtaskId);
      }
      return newSet;
    });
  }

  getSubtaskTableActions(): TableFieldActionButton[] {
    return [TABLE_ACTIONS.EDIT, TABLE_ACTIONS.ARCHIVE];
  }

  async archiveSubtask(subtaskId: string, visibility?: string): Promise<void> {
    const confirmed = await this.confirmDialogService.confirm({
      title: "Archive Subtask",
      message: "Are you sure you want to archive this subtask?",
      confirmText: "Archive",
      confirmClass: "bg-orange-600 hover:bg-orange-700",
    });
    if (!confirmed) return;

    if (this.isOffline()) {
      const response = await this.adminService.toggleDeleteStatusLocal("subtasks", subtaskId);
      if (response.status === ResponseStatus.SUCCESS) {
        this.notifyService.showSuccess("Subtask archived successfully");
        this.taskSubtasks.update((subtasks) => subtasks.filter((s) => s.id !== subtaskId));
      } else {
        this.notifyService.showError(response.message || "Failed to archive subtask");
      }
      return;
    }

    this.apiService.subtasks.delete(subtaskId, { visibility }).subscribe({
      next: () => {
        this.notifyService.showSuccess("Subtask archived successfully");
        this.taskSubtasks.update((subtasks) => subtasks.filter((s) => s.id !== subtaskId));
      },
      error: (err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to archive subtask";
        this.notifyService.showError(message);
      },
    });
  }

  override clearSelection(): void {
    super.clearSelection();
  }

  resolveTaskTitle(taskId: string): string {
    const task = this.storage.taskMap().get(taskId);
    return task?.title || "-";
  }

  getKanbanColumns() {
    return this.kanbanHelper.getKanbanColumns();
  }

  getColumnColorClass = this.kanbanHelper.getColumnColorClass;

  getSubtasksByStatus(status: TaskStatus): Subtask[] {
    return this.kanbanHelper.getSubtasksByStatus(this.listSubtasks(), status);
  }

  getConnectedKanbanDropLists(currentStatus: TaskStatus): string[] {
    return this.kanbanHelper.getConnectedKanbanDropLists(currentStatus);
  }

  onKanbanSubtaskDrop(event: CdkDragDrop<Subtask[]>, targetStatus: TaskStatus): void {
    this.kanbanHelper.onKanbanSubtaskDrop(
      event,
      targetStatus,
      this.todo(),
      (subtaskId, newStatus) => this.updateSubtaskStatus(subtaskId, newStatus)
    );
  }

  private updateSubtaskStatus(subtaskId: string, newStatus: TaskStatus): void {
    this.kanbanHelper.updateSubtaskStatus(subtaskId, newStatus, this.todo(), (fn) =>
      this.taskSubtasks.update(fn)
    );
  }

  onKanbanStatusCycle(subtask: Subtask): void {
    if (!this.canEditSubtask(subtask)) {
      this.notifyService.showError("You don't have permission to change subtask status");
      return;
    }
    this.kanbanHelper.onKanbanStatusCycle(subtask, (subtaskId, newStatus) =>
      this.updateSubtaskStatus(subtaskId, newStatus)
    );
  }

  onKanbanSubtaskClick(_subtask: Subtask): void {}

  onKanbanSelectionChange(subtaskId: string, isSelected: boolean): void {
    this.kanbanHelper.onKanbanSelectionChange(subtaskId, isSelected, (event) =>
      this.toggleSubtaskSelection(event)
    );
  }

  isKanbanSubtaskSelected(subtaskId: string): boolean {
    return this.kanbanHelper.isKanbanSubtaskSelected(subtaskId, this.selectedSubtasks());
  }
}

export { SubtasksViewComponent as SubtasksView };
