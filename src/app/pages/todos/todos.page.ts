import { CommonModule } from "@angular/common";
import {
  Component,
  OnInit,
  AfterViewInit,
  ViewChild,
  signal,
  inject,
  computed,
  DestroyRef,
} from "@angular/core";
import { RouterModule, ActivatedRoute, NavigationEnd, Router } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { CdkDragDrop, CdkDragEnter, CdkDropList, DragDropModule } from "@angular/cdk/drag-drop";
import { filter } from "rxjs/operators";
import { MatIconModule } from "@angular/material/icon";
import { MatSelectModule } from "@angular/material/select";
import { MatMenuModule } from "@angular/material/menu";
import { Todo } from "@entities/generated/api.types";
import { TemplateService } from "@services/features/template.service";
import { TodosBlueprintService } from "@services/features/todos-blueprint.service";
import { DragDropOrderService } from "@services/ui/drag-drop-order.service";
import { BulkActionService } from "@services/bulk-action.service";
import { ConfirmDialogService } from "@core/services/confirm-dialog.service";
import { ApiService } from "@services/api.service";
import { AdminService } from "@services/data/admin.service";
import { ResponseStatus } from "@entities/response.model";
import { DragDropHandlerService } from "@services/ui/drag-drop-handler.service";
import { PermissionService, TodoPermission } from "@core/services/permission.service";
import { EntityStoreService } from "@core/services/entity-store.service";
import { BulkActionHelper } from "@helpers/bulk-action.helper";
import { BaseListView } from "@pages/base-list.page";
import { StatsCardComponent } from "@components/stats-card/stats-card.component";
import { SegmentSelectorComponent } from "@components/segment-selector/segment-selector.component";
import {
  PageToolbarComponent,
  PageToolbarConfig,
} from "@components/page-toolbar/page-toolbar.component";
import { ViewMode } from "@entities/view-mode.model";
import { BlueprintCreateDialogComponent } from "@components/blueprint-dialogs/blueprint-create-dialog.component";
import { BlueprintSelectionDialogComponent } from "@components/blueprint-dialogs/blueprint-selection-dialog.component";
import { BlueprintApplyDialogComponent } from "@components/blueprint-dialogs/blueprint-apply-dialog.component";
import { TodosListComponent } from "@components/todos/todos-list/todos-list.component";
import { TodosStateService } from "@components/todos/todos-filters/todos-state.service";
import { TodosPaginationStateService } from "./todos-pagination.state";
import { TodosSelectionStateService } from "./todos-selection.state";
import {
  PullToRefreshDirective,
  PullToRefreshIndicatorComponent,
} from "@components/pull-to-refresh";
import { UnifiedSyncService } from "@services/sync/unified-sync.service";
import { VisibilityFilter } from "@entities/storage.model";
@Component({
  selector: "app-todos",
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatIconModule,
    MatSelectModule,
    MatMenuModule,
    DragDropModule,
    StatsCardComponent,
    SegmentSelectorComponent,
    PageToolbarComponent,
    BlueprintCreateDialogComponent,
    BlueprintSelectionDialogComponent,
    BlueprintApplyDialogComponent,
    TodosListComponent,
    PullToRefreshDirective,
    PullToRefreshIndicatorComponent,
  ],
  templateUrl: "./todos.page.html",
})
export class TodosView extends BaseListView implements OnInit, AfterViewInit {
  @ViewChild("todoPlaceholder", { read: CdkDropList }) protected todoPlaceholder!: CdkDropList;
  private keydownHandler = (event: KeyboardEvent): void => {
    if (event.key === "/" && document.activeElement?.tagName !== "INPUT") {
      event.preventDefault();
      this.showFilter.set(true);
      setTimeout(() => {
        const searchField = document.getElementById("searchField");
        if (searchField) searchField.focus();
      }, 100);
    }
  };
  public templateService = inject(TemplateService);
  public blueprintService = inject(TodosBlueprintService);
  public bulkService = inject(BulkActionService);
  private dragDropService = inject(DragDropOrderService);
  private dragDropHandlerService = inject(DragDropHandlerService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private apiService = inject(ApiService);
  private adminService = inject(AdminService);
  private destroyRef = inject(DestroyRef);
  private confirmDialogService = inject(ConfirmDialogService);
  private bulkActionHelper = inject(BulkActionHelper);
  private permissionService = inject(PermissionService);
  private entityStore = inject(EntityStoreService);
  private syncService = inject(UnifiedSyncService);
  protected stateService = inject(TodosStateService);
  private paginationState = inject(TodosPaginationStateService);
  private selectionState = inject(TodosSelectionStateService);
  refreshState = signal<"idle" | "pulling" | "triggered" | "refreshing" | "complete">("idle");
  refreshDistance = signal(0);
  override loading = signal(false);
  visibilityOptions = this.stateService.visibilityOptions;
  filterFields = this.stateService.filterFields;
  showStats = this.stateService.showStats;
  selectedTodos = this.selectionState.selectedTodos;
  highlightTodoId = this.stateService.highlightTodoId;
  todoPagination = this.paginationState.todoPagination;
  loadMore = () => this.paginationState.loadMore();
  protected getItems(): { id: string }[] {
    return this.stateService.listTodos();
  }
  override onSearchChange(query: string): void {
    super.onSearchChange(query);
    this.stateService.onSearchChange(query);
  }
  userId = signal("");
  get visibility() {
    return this.stateService.activeVisibility();
  }
  isSharedMode = computed(() => {
    return this.route.snapshot.url[0]?.path === "shared-tasks";
  });
  getToolbarConfig(): PageToolbarConfig {
    return {
      selectAll:
        this.viewMode() !== "table"
          ? {
              onToggle: () => this.toggleSelectAll(),
              isAllSelected: this.isAllSelected(),
              count: this.selectionState.selectedTodos().size,
              highlight: this.selectionState.selectedTodos().size > 0 && !this.isAllSelected(),
            }
          : undefined,
      stats: {
        onToggle: () => this.stateService.showStats.update((v) => !v),
        isActive: this.stateService.showStats(),
      },
      filter: {
        onToggle: () => this.toggleFilter(),
        isActive: this.showFilter(),
      },
      newButtonWithMenu: {
        label: "New",
        icon: "add",
        menuItems: [
          {
            label: "Blank Project",
            icon: "add",
            action: () => this.router.navigate(["/todos/create_todo"]),
          },
          {
            label: "From Blueprint",
            icon: "account_tree",
            action: () => this.blueprintService.showBlueprintDialog.set(true),
          },
        ],
      },
      viewMode: {
        mode: this.viewMode(),
        pageKey: this.isSharedMode() ? "shared-tasks" : "todos",
        onModeChange: (mode: ViewMode) => this.setViewMode(mode),
      },
      refresh: {
        onClick: () => {
          this.refreshState.set("refreshing");
          this.syncService.refreshLocal().finally(() => {
            this.refreshState.set("idle");
            this.paginationState.loadInitialTodos();
          });
        },
        loading: this.refreshState() === "refreshing",
      },
      filterFields: this.stateService.filterFields,
      showFilter: this.showFilter(),
      onFiltersChange: (filters: Record<string, string | string[] | any>) =>
        this.onFiltersChange(filters),
    };
  }
  onFiltersChange(filters: Record<string, string | string[] | any>): void {
    this._activeFilters.set(filters);
    if (filters["status"]) {
      this.stateService.statusFilter.set(filters["status"] as string);
    }
    if (filters["priority"]) {
      this.stateService.priorityFilter.set(filters["priority"] as string);
    }
  }
  private _activeFilters = signal<Record<string, string | string[] | any>>({});
  onVisibilityChange(visibility: string): void {
    this.stateService.activeVisibility.set(visibility as any);
    this.entityStore.ensureTodosLoaded(visibility as VisibilityFilter);
  }
  onPullToRefresh(): Promise<void> {
    return this.syncService.syncAll() as unknown as Promise<void>;
  }
  override ngOnInit(): void {
    super.ngOnInit();
    this.pageKey = this.isSharedMode() ? "shared-tasks" : "todos";
    this.viewMode.set(this.loadViewModePreference());
    this.bulkService.setMode(this.isSharedMode() ? "shared" : "todos");
    this.bulkService.updateTotalCount(
      this.isSharedMode()
        ? this.entityStore.sharedTodos().length
        : this.entityStore.privateTodos().length
    );
    this.subscriptions.add(
      this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
        this.clearSelection();
      })
    );
    this.subscriptions.add(
      this.route.queryParams.subscribe((queryParams: any) => {
        super.handleHighlightQueryParams(queryParams, "highlightTodoId", "todo-");
      })
    );
    document.addEventListener("keydown", this.keydownHandler);
    this.userId.set(this.authService.getValueByKey("id"));
    const refreshSub = this.shortcutService.refresh$.subscribe(() => {
      if (!this.authService.isLoggedIn()) {
        this.router.navigate(["/login"]);
        return;
      }
      this.refreshState.set("refreshing");
      this.syncService.refreshLocal().finally(() => {
        this.refreshState.set("idle");
      });
      if (this.entityStore.todos().length === 0) {
        this.paginationState.loadInitialTodos();
      }
    });
    this.destroyRef.onDestroy(() => refreshSub.unsubscribe());
    const filterSub = this.shortcutService.filter$.subscribe(() => {
      this.toggleFilter();
    });
    this.destroyRef.onDestroy(() => filterSub.unsubscribe());
    this.paginationState.loadInitialTodos();
  }
  override ngOnDestroy(): void {
    document.removeEventListener("keydown", this.keydownHandler);
    super.ngOnDestroy();
  }
  getFilteredCount(filter: string): number {
    return this.stateService.getFilteredCount(filter);
  }
  async deleteTodoById(
    todoId?: string,
    visibility?: string,
    _isOwner: boolean = true
  ): Promise<void> {
    const confirmed = await this.confirmDialogService.confirm({
      title: "Delete Project",
      message: "Are you sure you want to delete this project?",
      confirmText: "Delete",
      confirmClass: "bg-red-600 hover:bg-red-700",
    });
    if (!confirmed) return;
    const targetDb = visibility === "private" ? "local" : "cloud";
    this.entityStore
      .deleteEntity("todos", todoId!, { targetDb: targetDb as any, visibility: visibility as any })
      .subscribe({
        next: () => {
          this.entityStore.removeEntity("todos", todoId!);
          this.notifyService.showSuccess("Todo deleted successfully");
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to delete todo");
        },
      });
  }
  async archiveTodoById(todoId?: string): Promise<void> {
    const confirmed = await this.confirmDialogService.confirm({
      title: "Archive Project",
      message: "Are you sure you want to archive this project?",
      confirmText: "Archive",
      confirmClass: "bg-orange-600 hover:bg-orange-700",
    });
    if (confirmed) {
      if (this.isOffline()) {
        const response = await this.adminService.toggleDeleteStatusLocal("todos", todoId!);
        if (response.status === ResponseStatus.SUCCESS) {
          this.entityStore.updateEntitySignal("todos", todoId!, {
            deleted_at: new Date().toISOString(),
          });
          this.notifyService.showSuccess("Todo archived successfully");
        } else {
          this.notifyService.showError(response.message || "Failed to archive todo");
        }
        return;
      }
      const todo = this.entityStore.todos().find((t: Todo) => t.id === todoId);
      if (!todo) {
        this.notifyService.showError("Todo not found");
        return;
      }
      const targetDb = todo.visibility === "private" ? "local" : "cloud";
      this.entityStore
        .archiveEntity("todos", todoId!, {
          targetDb: targetDb as any,
          visibility: todo.visibility as any,
        })
        .subscribe({
          next: () => {
            this.entityStore.updateEntitySignal("todos", todoId!, {
              deleted_at: new Date().toISOString(),
            });
            this.notifyService.showSuccess("Todo archived successfully");
          },
          error: (err) => {
            this.notifyService.showError(err.message || "Failed to archive todo");
          },
        });
    }
  }
  async restoreTodoById(todoId?: string): Promise<void> {
    const confirmed = await this.confirmDialogService.confirm({
      title: "Restore Project",
      message:
        "Are you sure you want to restore this project? It will be returned to its original location.",
      confirmText: "Restore",
      confirmClass: "bg-green-600 hover:bg-green-700",
    });
    if (confirmed) {
      const todo = this.entityStore.todos().find((t: Todo) => t.id === todoId);
      if (!todo) {
        this.notifyService.showError("Todo not found");
        return;
      }
      if (this.isOffline()) {
        const response = await this.adminService.toggleDeleteStatusLocal("todos", todoId!);
        if (response.status === ResponseStatus.SUCCESS) {
          this.entityStore.updateEntitySignal("todos", todoId!, { deleted_at: undefined });
          this.notifyService.showSuccess("Todo restored successfully");
        } else {
          this.notifyService.showError(response.message || "Failed to restore todo");
        }
        return;
      }
      const targetDb = todo.visibility === "private" ? "local" : "cloud";
      this.entityStore
        .restoreEntity("todos", todoId!, {
          targetDb: targetDb as any,
          visibility: todo.visibility as any,
        })
        .subscribe({
          next: () => {
            this.entityStore.updateEntitySignal("todos", todoId!, { deleted_at: undefined });
            this.notifyService.showSuccess("Todo restored successfully");
          },
          error: (err) => {
            this.notifyService.showError(err.message || "Failed to restore todo");
          },
        });
    }
  }
  onUpdateTodo(todo: Todo, event: { field: string; value: any }): void {
    const { field, value } = event;
    const targetDb = todo.visibility === "private" ? "local" : "cloud";
    this.entityStore
      .updateEntity(
        "todos",
        todo.id,
        { [field]: value },
        { targetDb: targetDb as any, visibility: todo.visibility as any }
      )
      .subscribe({
        next: (updatedTodo) => {
          this.entityStore.updateEntitySignal("todos", todo.id, {
            ...(updatedTodo as any),
            id: todo.id,
          });
          this.notifyService.showSuccess("Project updated successfully");
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to update project");
        },
      });
  }
  onRangeSelect(event: { anchorId: string; targetId: string }): void {
    this.selectRange(event.anchorId, event.targetId, this.stateService.listTodos());
  }
  onAdditiveSelect(id: string): void {
    this.toggleItemSelection(id);
    this.lastSelectedId.set(id);
  }
  onRowClick(event: { event: MouseEvent; item: any } | any): void {
    const item = event.item || event;
    const mouseEvent = event.event;
    if (mouseEvent?.shiftKey) {
      const anchorId = this.lastSelectedId();
      if (anchorId) {
        this.selectRange(anchorId, item.id, this.stateService.listTodos());
        return;
      }
    } else if (mouseEvent?.ctrlKey || mouseEvent?.metaKey) {
      this.toggleItemSelection(item.id);
      this.lastSelectedId.set(item.id);
      return;
    }
    this.lastSelectedId.set(item.id);
    this.router.navigate(["/todos", item.id, "tasks"], {
      queryParams: { visibility: item.visibility || "private" },
    });
  }
  async onTableAction(event: { action: string; item: Todo }): Promise<void> {
    const { action, item } = event;
    const perm = this.getUserTodoPermission(item);
    switch (action) {
      case "blueprint":
        if (item.user_id !== this.currentUserId) {
          break;
        }
        this.saveAsBlueprint(item);
        break;
      case "edit":
        if (!this.permissionService.canEditTodoFields(perm)) {
          break;
        }
        this.router.navigate(["/todos", item.id, "edit_todo"], {
          queryParams: { visibility: item.visibility },
        });
        break;
      case "archive":
        if (!this.permissionService.canArchiveTodo(perm)) {
          break;
        }
        const archiveConfirmed = await this.confirmDialogService.confirm({
          title: "Archive Project",
          message: "Are you sure you want to archive this project?",
          confirmText: "Archive",
          confirmClass: "bg-orange-600 hover:bg-orange-700",
        });
        if (archiveConfirmed) {
          this.archiveTodoById(item.id);
        }
        break;
      case "delete":
        if (perm !== TodoPermission.OWNER) {
          break;
        }
        this.deleteTodoById(item.id, item.visibility, item.user_id === this.currentUserId);
        break;
    }
  }
  private getUserTodoPermission(todo: Todo): TodoPermission {
    return this.permissionService.getTodoPermission(todo, this.currentUserId);
  }
  ngAfterViewInit(): void {
    if (!this.todoPlaceholder?.element?.nativeElement) return;
    const el = this.todoPlaceholder.element.nativeElement as HTMLElement;
    el.style.display = "none";
    el.parentNode?.removeChild(el);
  }
  saveAsBlueprint(todo: Todo) {
    this.blueprintService.saveAsBlueprint(todo);
  }
  confirmSaveAsBlueprint() {
    this.blueprintService.confirmSaveAsBlueprint();
  }
  closeCreateBlueprintDialog() {
    this.blueprintService.closeCreateBlueprintDialog();
  }
  confirmCreateFromBlueprint() {
    this.blueprintService.confirmCreateFromBlueprint(this.currentUserId).subscribe();
  }
  openApplyBlueprint(template: any) {
    this.blueprintService.openApplyBlueprint(template);
  }
  removeBlueprint(templateId: string) {
    this.blueprintService.removeBlueprint(templateId);
  }
  override clearSelection(): void {
    super.clearSelection();
    this.selectionState.selectedTodos.set(new Set());
  }
  override toggleItemSelection(id: string): void {
    super.toggleItemSelection(id);
    this.selectionState.selectedTodos.set(new Set(this.selectedItems()));
    this.bulkService.setSelectionState(
      this.selectionState.selectedTodos().size,
      this.isAllSelected()
    );
  }
  protected override selectRange(fromId: string, toId: string, items: { id: string }[]): void {
    super.selectRange(fromId, toId, items);
    this.selectionState.selectedTodos.set(new Set(this.selectedItems()));
    this.bulkService.setSelectionState(
      this.selectionState.selectedTodos().size,
      this.isAllSelected()
    );
  }
  toggleTodoSelection(event: { id: string; selected: boolean }): void {
    const { id, selected } = event;
    if (selected) {
      this.lastSelectedId.set(id);
    }
    this.selectionState.toggleTodoSelection(event);
    this.selectedItems.set(new Set(this.selectionState.selectedTodos()));
    this.bulkService.setSelectionState(
      this.selectionState.selectedTodos().size,
      this.isAllSelected()
    );
  }
  override toggleSelectAll(): void {
    super.toggleSelectAll(
      () => this.stateService.listTodos(),
      () => this.isAllSelected()
    );
  }
  onTableSelectAll(event: { selectAll: boolean; section?: "private" | "shared" | "public" }): void {
    this.selectionState.onTableSelectAll(event);
    this.selectedItems.set(new Set(this.selectionState.selectedTodos()));
    this.bulkService.setSelectionState(
      this.selectionState.selectedTodos().size,
      this.isAllSelected()
    );
  }
  override isAllSelected(): boolean {
    return super.isAllSelected(() => this.stateService.listTodos());
  }
  canArchiveSelected(): boolean {
    const selected = this.selectionState.selectedTodos();
    if (selected.size === 0) return false;
    const allTodos = this.stateService.listTodos();
    const selectedIdsArr = Array.from(selected);
    const selectedTodosList = allTodos.filter((t: Todo) => selectedIdsArr.includes(t.id));
    return selectedTodosList.some((t: Todo) => {
      const perm = this.getUserTodoPermission(t);
      return this.permissionService.canArchiveTodo(perm);
    });
  }
  async bulkArchive(): Promise<void> {
    const selected = this.selectionState.selectedTodos();
    if (selected.size === 0) return;
    const allTodos = this.stateService.listTodos();
    const selectedIdsArr = Array.from(selected);
    const selectedTodosList = allTodos.filter((t: Todo) => selectedIdsArr.includes(t.id));
    const allowedTodos = selectedTodosList.filter((t: Todo) => {
      const perm = this.getUserTodoPermission(t);
      return this.permissionService.canArchiveTodo(perm);
    });
    const skippedCount = selected.size - allowedTodos.length;
    if (allowedTodos.length === 0) {
      this.notifyService.showError(
        "You don't have permission to archive any of the selected projects"
      );
      return;
    }
    const confirmed = await this.confirmDialogService.confirm({
      title: "Archive Projects",
      message: `Are you sure you want to archive ${selected.size} project(s)?${skippedCount > 0 ? ` (${skippedCount} skipped due to permissions)` : ""}`,
      confirmText: "Archive All",
      confirmClass: "bg-orange-600 hover:bg-orange-700",
    });
    if (confirmed) {
      const allowedIds = new Set(allowedTodos.map((t: Todo) => t.id));
      if (this.isOffline()) {
        let successCount = 0;
        let errorCount = 0;
        for (const todoId of Array.from(allowedIds)) {
          const response = await this.adminService.toggleDeleteStatusLocal(
            "todos",
            todoId as string
          );
          if (response.status === ResponseStatus.SUCCESS) {
            this.entityStore.updateEntitySignal("todos", todoId, {
              deleted_at: new Date().toISOString(),
            });
            successCount++;
          } else {
            errorCount++;
          }
        }
        if (skippedCount > 0) {
          this.notifyService.showWarning(
            `Archived ${successCount} project(s), ${errorCount} failed, ${skippedCount} skipped`
          );
        } else if (errorCount > 0) {
          this.notifyService.showWarning(
            `Archived ${successCount} project(s), ${errorCount} failed`
          );
        } else {
          this.notifyService.showSuccess(`${successCount} project(s) archived successfully`);
        }
        this.clearSelection();
        return;
      }
      const selectedArray = Array.from(allowedIds).map((id) => ({ id }));
      const sub = this.bulkActionHelper
        .bulkDelete(selectedArray, (id) => this.apiService.todos.delete(id))
        .subscribe({
          next: (result) => {
            this.clearSelection();
            if (result.errorCount === 0) {
              selected.forEach((todoId) => {
                this.entityStore.updateEntitySignal("todos", todoId, {
                  deleted_at: new Date().toISOString(),
                });
              });
              this.notifyService.showSuccess(
                `${result.successCount} project(s) archived successfully`
              );
            } else {
              this.notifyService.showWarning(
                `Archived ${result.successCount} project(s), ${result.errorCount} failed.`
              );
            }
          },
          error: (err) => {
            this.notifyService.showError(err.message || "Failed to archive projects");
          },
        });
      this.destroyRef.onDestroy(() => sub.unsubscribe());
    }
  }
  onTodoDrop(event: CdkDragDrop<Todo[]>): void {
    this.dragDropService
      .handleDrop(event, this.stateService.listTodos(), "todos", "todos")
      .subscribe({
        next: () => {
          this.notifyService.showSuccess("Project reordered successfully");
        },
        error: () => {
          this.notifyService.showError("Failed to reorder projects");
        },
      });
  }
  onTodoListEntered(event: CdkDragEnter): void {
    this.dragDropHandlerService.onListEntered(event, this.todoPlaceholder);
  }
  onTodoListDropped(_event: CdkDragDrop<Todo[]>): void {
    this.dragDropHandlerService.onListDropped(
      this.todoPlaceholder,
      (prev: number, curr: number) => {
        if (prev === curr) return;
        const todos = this.stateService.listTodos();
        const syntheticEvent = {
          previousIndex: prev,
          currentIndex: curr,
          item: null,
          container: null,
          previousContainer: null,
          distance: { x: 0, y: 0 },
        } as unknown as CdkDragDrop<Todo[]>;
        this.dragDropService.handleDrop(syntheticEvent, todos, "todos", "todos").subscribe({
          next: () => {
            this.notifyService.showSuccess("Project reordered successfully");
          },
          error: () => {
            this.notifyService.showError("Failed to reorder projects");
          },
        });
      }
    );
  }
}
