/* sys lib */
import { CommonModule } from "@angular/common";
import {
  Component,
  OnInit,
  signal,
  effect,
  ChangeDetectorRef,
  inject,
  computed,
  OnDestroy,
  HostListener,
  DestroyRef,
} from "@angular/core";
import { ActivatedRoute, RouterModule, NavigationEnd, Router } from "@angular/router";
import { CdkDragDrop, DragDropModule } from "@angular/cdk/drag-drop";
import { Subscription, firstValueFrom } from "rxjs";
import { filter, map } from "rxjs/operators";
import { toSignal } from "@angular/core/rxjs-interop";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Chat } from "@models/chat.model";

interface QueryParams {
  fromKanban?: string;
  highlightSubtask?: string;
  openComments?: string;
  highlightComment?: string;
}

/* services */
import { AuthService } from "@services/auth/auth.service";
import { AuthorizationService } from "@services/features/authorization.service";
import { NotifyService } from "@services/notifications/notify.service";
import { DragDropOrderService } from "@services/ui/drag-drop-order.service";
import { BulkActionService } from "@services/bulk-action.service";
import { StorageService } from "@services/storage.service";
import { ShortcutService } from "@services/ui/shortcut.service";
import { AppStateService } from "@services/core/app-state.service";
import { ConfirmDialogService } from "@services/core/confirm-dialog.service";
import { REQUEST_SERVICE, Visibility } from "@services/api.service";
import { AdminService } from "@services/data/admin.service";
import { ResponseStatus } from "@models/response.model";

/* helpers */
import { BaseItemHelper } from "@helpers/base-item.helper";
import { FilteredListHelper } from "@helpers/filtered-list.helper";
import { FilterHelper } from "@helpers/filter.helper";
import { SortHelper } from "@helpers/sort.helper";
import { BulkActionHelper } from "@helpers/bulk-action.helper";

/* views */
import { BaseListView } from "@views/base-list.view";

/* components */
import { SubtaskComponent } from "@components/subtask/subtask.component";
import { TaskInformationComponent } from "@components/task-information/task-information.component";
import { FilterBarComponent } from "@components/filter-bar/filter-bar.component";
import { ChatWindowComponent } from "@components/chat-window/chat-window.component";
import { BulkActionsComponent } from "@components/bulk-actions/bulk-actions.component";
import { TableViewComponent } from "@components/table-view/table-view.component";
import { TableField, TableFieldActionButton } from "@components/table-view/table-field.model";
import { TABLE_ACTIONS } from "@constants/table-field.constants";
import { EmptyStateComponent } from "@components/empty-state/empty-state.component";
import {
  PageToolbarComponent,
  PageToolbarConfig,
} from "@components/page-toolbar/page-toolbar.component";
import { ItemExpandDetailsComponent } from "@components/item-expand-details/item-expand-details.component";
import { LoadingStateComponent } from "@components/loading-state/loading-state.component";
import { ChatFabComponent } from "@components/chat-fab/chat-fab.component";

@Component({
  selector: "app-subtasks",
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    MatProgressSpinnerModule,
    SubtaskComponent,
    TaskInformationComponent,
    FilterBarComponent,
    DragDropModule,
    ChatWindowComponent,
    BulkActionsComponent,
    TableViewComponent,
    EmptyStateComponent,
    PageToolbarComponent,
    ItemExpandDetailsComponent,
    LoadingStateComponent,
    ChatFabComponent,
  ],
  templateUrl: "./subtasks.view.html",
})
export class SubtasksView extends BaseListView implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private requestService = inject(REQUEST_SERVICE);
  private cdr = inject(ChangeDetectorRef);
  private dragDropService = inject(DragDropOrderService);
  public bulkService = inject(BulkActionService);
  private appStateService = inject(AppStateService);
  private authorizationService = inject(AuthorizationService);
  private bulkActionHelper = inject(BulkActionHelper);
  private destroyRef = inject(DestroyRef);
  private confirmDialogService = inject(ConfirmDialogService);
  private adminService = inject(AdminService);

  protected getItems(): { id: string }[] {
    return this.listSubtasks();
  }

  protected get selectedSubtasks() {
    return this.selectedItems;
  }

  showChat = signal(false);
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

  private lastTaskIdForEffect: string | null = null;

  private taskEffect = effect(() => {
    const taskId = this.routeTaskId() || this.route.snapshot.paramMap.get("taskId");
    if (taskId && taskId !== this.lastTaskIdForEffect) {
      this.lastTaskIdForEffect = taskId;
      this.loadTask(taskId);
    }
  });

  private loadTask(taskId: string): void {
    const taskReactive = this.storageService.getTaskReactive(taskId);
    const reactiveTask = taskReactive();
    if (reactiveTask) {
      this.task.set(reactiveTask);
      if (reactiveTask.todo_id) {
        this.loadTodo(reactiveTask.todo_id);
      }
      this.loadInitialSubtasks();
    } else {
      this.notifyService.showError("Task not found. Please refresh.");
    }
  }

  private loadTodo(todoId: string): void {
    const todoReactive = this.storageService.getTodoReactive(todoId);
    const reactiveTodo = todoReactive();
    if (reactiveTodo) {
      this.todo.set(reactiveTodo);
      this.todoId.set(reactiveTodo.id);
      this.projectTitle.set(reactiveTodo.title);
    } else {
      this.notifyService.showError("Todo not found.");
    }
  }

  private loadChats(todoId: string): void {
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

  fromKanban = signal(false);
  highlightSubtask = signal<string | null>(null);
  highlightComment = signal<string | null>(null);
  openCommentsForSubtaskId = signal<string | null>(null);
  private routeSub?: Subscription;

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

  loadInitialSubtasks() {
    const taskId = this.task()?.id;
    const visibility = this.todo()?.visibility || "private";
    if (!taskId) return;

    if (this.isLoadingSubtasks && this.lastLoadedTaskId === taskId) return;

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
    const visibility = this.todo()?.visibility || "private";
    if (!taskId) return;

    this.subtaskPagination.update((p) => ({ ...p, loading: true }));

    this.requestService
      .loadPage<Subtask>("subtasks", {
        filter: { task_id: taskId },
        visibility: visibility as Visibility,
        skip: this.subtaskPagination().skip,
        limit: this.subtaskPagination().limit,
      })
      .subscribe({
        next: (subtasks: Subtask[]) => {
          this.taskSubtasks.update((current) => [...current, ...subtasks]);
          this.subtaskPagination.update((p) => ({
            ...p,
            skip: p.skip + subtasks.length,
            loading: false,
            hasMore: subtasks.length === p.limit,
          }));
        },
        error: () => {
          this.subtaskPagination.update((p) => ({ ...p, loading: false }));
        },
      });
  }

  constructor() {
    super();
  }

  listSubtasks = computed(() => {
    return FilteredListHelper.filterAndSort(this.taskSubtasks(), {
      filter: this.activeFilter(),
      query: this.searchQuery(),
      filterType: "status",
    });
  });

  override isAllSelected(): boolean {
    return super.isAllSelected(() => this.listSubtasks());
  }

  userId: string = "";

  isOwner = computed(() => this.todo()?.user_id === this.userId);
  isPrivate = computed(() => this.todo()?.visibility === "private");

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

  subtaskTableFields: TableField[] = [
    { key: "title", label: "Subtask", type: "text", sortable: true },
    { key: "priority", label: "Priority", type: "priority", sortable: true },
    { key: "status", label: "Status", type: "status", onClick: (item) => this.cycleStatus(item) },
    {
      key: "comments",
      label: "Comments",
      type: "number",
      getValue: (item) => item.comments_count || 0,
    },
  ];

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
        if (queryParams.fromKanban !== undefined) {
          this.fromKanban.set(queryParams.fromKanban === "true");
        }
        if (queryParams.highlightSubtask) {
          const id = queryParams.highlightSubtask;
          this.highlightSubtask.set(id);
          if (queryParams.openComments) {
            this.openCommentsForSubtaskId.set(id);
          }
          super.handleHighlightQueryParams(
            queryParams,
            "highlightSubtask",
            "subtask-",
            "ring-purple-500"
          );
          this.highlightSubtask.set(null);
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
      const dataResolve = routeData["task"];
      if (dataResolve?.["todo"]) {
        const todoData = dataResolve["todo"];
        this.todoId.set(todoData.id);
        this.projectTitle.set(todoData.title);
        if (dataResolve["task"]) {
          this.task.set(dataResolve["task"]);
          this.loadInitialSubtasks();
        }
      }
      this.loading.set(false);
      this.cdr.detectChanges();
    } else {
      const taskId = this.route.snapshot.paramMap.get("taskId");
      if (taskId) {
        const taskReactive = this.storageService.getTaskReactive(taskId);
        const reactiveTask = taskReactive();
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
  }

  onRowClick(event: { event: MouseEvent; item: any } | any): void {
    const subtask = event.item || event;
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
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { highlightSubtask: subtask.id, openComments: "true" },
    });
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
  }

  onRangeSelect(event: { anchorId: string; targetId: string }): void {
    this.selectRange(event.anchorId, event.targetId, this.listSubtasks());
  }

  onAdditiveSelect(id: string): void {
    this.toggleItemSelection(id);
    this.lastSelectedId.set(id);
  }

  onCommentToggle(subtaskId: string): void {
    this.highlightComment.set(null);
  }

  toggleChat() {
    this.showChat.update((v) => !v);
  }

  toggleInfoBlock() {
    this.appStateService.toggleInfoBlock();
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
      newButton: {
        onClick: () => this.router.navigate(["create_subtask"], { relativeTo: this.route }),
        label: "New Subtask",
        icon: "add",
      },
      viewMode: {
        mode: this.viewMode(),
        pageKey: "subtasks",
        onModeChange: (mode) => this.setViewMode(mode),
      },
    };
  }

  override getUnreadCount(): number {
    return super.getUnreadCount(this.chats);
  }

  toggleSubtaskCompletion(subtask: Subtask) {
    const todo = this.todo();
    const visibility = todo?.visibility || "private";

    const newStatus = BaseItemHelper.getNextStatus(subtask.status);

    this.requestService
      .update<Subtask>(
        "subtasks",
        subtask.id,
        { status: newStatus },
        { visibility: visibility as Visibility, offline: true }
      )
      .subscribe({
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

  cycleStatus(subtask: Subtask) {
    this.toggleSubtaskCompletion(subtask);
  }

  updateSubtaskInline(event: { subtask: Subtask; field: string; value: unknown }) {
    const todo = this.todo();
    const visibility = todo?.visibility || "private";

    this.requestService
      .update<Subtask>(
        "subtasks",
        event.subtask.id,
        { [event.field]: event.value },
        { visibility: visibility as Visibility }
      )
      .subscribe({
        next: () => {},
        error: (err: unknown) => {
          const message = err instanceof Error ? err.message : "Failed to update subtask";
          this.notifyService.showError(message);
        },
      });
  }

  async deleteSubtask(id: string) {
    const todo = this.todo();
    const visibility = todo?.visibility || "private";

    const confirmed = await this.confirmDialogService.confirm({
      title: "Delete Subtask",
      message: "Are you sure you want to delete this subtask?",
      confirmText: "Delete",
      confirmClass: "bg-red-600 hover:bg-red-700",
    });
    if (!confirmed) return;

    this.requestService.delete("subtasks", id, { visibility: visibility as Visibility }).subscribe({
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
      .handleDrop(
        event,
        this.listSubtasks(),
        "subtasks",
        "subtasks",
        taskId,
        this.isPrivate() ? "private" : "shared"
      )
      .subscribe({
        next: () => {},
        error: (err) => {
          console.error("Reorder subtasks failed:", err);
          this.notifyService.showError("Failed to reorder subtasks");
        },
      });
  }

  toggleSubtaskSelection(event: { id: string; selected: boolean }): void {
    const { id, selected } = event;
    if (selected) {
      this.lastSelectedId.set(id);
    }
    this.selectedSubtasks.update((subtaskIds) => {
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

  bulkUpdateStatus(status: string): void {
    const selected = this.selectedSubtasks();
    if (selected.size === 0) return;

    const visibility = this.isPrivate() ? "private" : "shared";
    const updatePromises = Array.from(selected).map((subtaskId) => {
      return firstValueFrom(
        this.requestService.update(
          "subtasks",
          subtaskId,
          { status: status as any },
          { visibility: visibility as Visibility }
        )
      );
    });

    Promise.all(updatePromises)
      .then((results) => {
        this.notifyService.showSuccess(`${selected.size} subtask(s) updated`);
        this.clearSelection();
      })
      .catch((err) => {
        this.notifyService.showError(err.message || "Failed to update subtasks");
      });
  }

  async bulkArchive(): Promise<void> {
    const selected = this.selectedSubtasks();
    if (selected.size === 0) return;

    const visibility = this.isPrivate() ? "private" : "shared";

    const confirmed = await this.confirmDialogService.confirm({
      title: "Archive Subtasks",
      message: `Are you sure you want to archive ${selected.size} subtask(s)?`,
      confirmText: "Archive All",
      confirmClass: "bg-orange-600 hover:bg-orange-700",
    });
    if (!confirmed) return;

    if (this.isOffline()) {
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
        this.notifyService.showWarning(
          `Archived ${successCount} subtask(s), ${errorCount} failed.`
        );
      } else {
        this.notifyService.showSuccess(`${successCount} subtask(s) archived successfully`);
      }
      this.clearSelection();
      return;
    }

    const deletePromises = Array.from(selected).map((id) => {
      return firstValueFrom(
        this.requestService.delete("subtasks", id, { visibility: visibility as Visibility })
      );
    });

    Promise.all(deletePromises)
      .then(() => {
        this.notifyService.showSuccess(`${selected.size} subtask(s) archived successfully`);
        this.clearSelection();
      })
      .catch((err) => {
        this.notifyService.showError(err.message || "Failed to archive subtasks");
      });
  }

  getSubtaskTableActions(): TableFieldActionButton[] {
    return [TABLE_ACTIONS.EDIT, TABLE_ACTIONS.DELETE];
  }

  onSubtaskTableAction(event: { action: string; item: Subtask }): void {
    switch (event.action) {
      case "edit":
        this.router.navigate([event.item.id, "edit_subtask"], {
          relativeTo: this.route,
          queryParams: { isOwner: this.isOwner(), isPrivate: this.isPrivate() },
        });
        break;
      case "delete":
        this.deleteSubtask(event.item.id);
        break;
      case "toggle_status":
        this.toggleSubtaskCompletion(event.item);
        break;
    }
  }

  override clearSelection(): void {
    super.clearSelection();
  }

  resolveTaskTitle(taskId: string): string {
    const task = this.storageService.getTaskById(taskId);
    return task?.title || "-";
  }

  override ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    super.ngOnDestroy();
  }
}
