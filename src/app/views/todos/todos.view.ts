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

import { Todo } from "@models/generated/api.types";

import { TemplateService } from "@services/features/template.service";
import { TodosBlueprintService } from "@services/features/todos-blueprint.service";
import { DragDropOrderService } from "@services/ui/drag-drop-order.service";
import { BulkActionService } from "@services/bulk-action.service";
import { ConfirmDialogService } from "@services/core/confirm-dialog.service";
import { ApiService } from "@services/api.service";
import { AdminService } from "@services/data/admin.service";
import { ResponseStatus } from "@models/response.model";
import { DragDropHandlerService } from "@services/ui/drag-drop-handler.service";

import { BulkActionHelper } from "@helpers/bulk-action.helper";

import { BaseListView } from "@views/base-list.view";

import { StatsCardComponent } from "@components/stats-card/stats-card.component";
import { SegmentSelectorComponent } from "@components/segment-selector/segment-selector.component";
import {
  PageToolbarComponent,
  PageToolbarConfig,
} from "@components/page-toolbar/page-toolbar.component";
import { FilterField } from "@models/filter-config.model";
import { ViewMode } from "@models/view-mode.model";
import { BlueprintCreateDialogComponent } from "@components/blueprint-dialogs/blueprint-create-dialog.component";
import { BlueprintSelectionDialogComponent } from "@components/blueprint-dialogs/blueprint-selection-dialog.component";
import { BlueprintApplyDialogComponent } from "@components/blueprint-dialogs/blueprint-apply-dialog.component";

import { TodosListComponent } from "@components/todos/todos-list/todos-list.component";
import { TodosStateService } from "@components/todos/todos-filters/todos-state.service";

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
  ],
  templateUrl: "./todos.view.html",
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

  stateService = inject(TodosStateService);

  protected getItems(): { id: string }[] {
    return this.stateService.listTodos();
  }

  highlightTodoId = signal<string | null>(null);
  userId = signal("");
  showStats = signal(false);

  visibilityOptions = computed(() => [
    { id: "all", label: "All", icon: "apps", count: this.stateService.allTodosFlat().length },
    {
      id: "private",
      label: "Private",
      icon: "lock",
      count: this.storageService.privateTodos().filter((t: Todo) => !t.deleted_at).length,
    },
    {
      id: "shared",
      label: "Shared",
      icon: "group",
      count: this.storageService.sharedTodos().filter((t: Todo) => !t.deleted_at).length,
    },
    {
      id: "public",
      label: "Public",
      icon: "public",
      count: this.storageService.publicTodos().filter((t: Todo) => !t.deleted_at).length,
    },
  ]);

  selectedTodos = this.selectedItems;

  isSharedMode = computed(() => {
    return this.route.snapshot.url[0]?.path === "shared-tasks";
  });

  filterFields: FilterField[] = [
    {
      key: "status",
      label: "Status",
      type: "radio",
      options: [
        { key: "all", label: "All" },
        { key: "active", label: "Active" },
        { key: "completed", label: "Completed" },
        { key: "week", label: "This Week" },
      ],
    },
    {
      key: "priority",
      label: "Priority",
      type: "radio",
      options: [
        { key: "all", label: "All" },
        { key: "low", label: "Low" },
        { key: "medium", label: "Medium" },
        { key: "high", label: "High" },
        { key: "urgent", label: "Urgent" },
      ],
    },
  ];

  getToolbarConfig(): PageToolbarConfig {
    return {
      selectAll:
        this.viewMode() !== "table"
          ? {
              onToggle: () => this.toggleSelectAll(),
              isAllSelected: this.isAllSelected(),
              count: this.selectedTodos().size,
              highlight: this.selectedTodos().size > 0 && !this.isAllSelected(),
            }
          : undefined,
      stats: {
        onToggle: () => this.showStats.update((v) => !v),
        isActive: this.showStats(),
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
      filterFields: this.filterFields,
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

  get visibility() {
    return this.stateService.activeVisibility();
  }

  todoPagination = signal<{
    skip: number;
    limit: number;
    total: number;
    hasMore: boolean;
    loading: boolean;
  }>({ skip: 0, limit: 10, total: 0, hasMore: true, loading: false });

  loadInitialTodos() {
    const hasTodos = this.storageService.todos().length > 0;
    if (hasTodos) {
      this.todoPagination.update((p) => ({
        ...p,
        skip: this.storageService.todos().length,
        hasMore: this.storageService.hasMoreTodos,
        total: this.storageService.todos().length,
        loading: false,
      }));
      return;
    }

    this.todoPagination.update((p) => ({ ...p, loading: true }));
    this.storageService.ensureTodosLoaded();
    this.todoPagination.update((p) => ({ ...p, loading: false }));
  }

  loadMore() {
    if (this.todoPagination().loading || !this.todoPagination().hasMore) return;
    this.storageService.ensureTodosLoaded();
  }

  onVisibilityChange(visibility: string): void {
    this.stateService.activeVisibility.set(visibility as any);
    this.storageService.ensureTodosLoaded(visibility);
  }

  override ngOnInit(): void {
    super.ngOnInit();

    this.pageKey = this.isSharedMode() ? "shared-tasks" : "todos";

    this.viewMode.set(this.loadViewModePreference());

    this.bulkService.setMode(this.isSharedMode() ? "shared" : "todos");
    this.bulkService.updateTotalCount(
      this.isSharedMode()
        ? this.storageService.sharedTodos().filter((t: Todo) => !t.deleted_at).length
        : this.storageService.privateTodos().filter((t: Todo) => !t.deleted_at).length
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
      if (this.storageService.todos().length === 0) {
        this.loadInitialTodos();
      }
    });
    this.destroyRef.onDestroy(() => refreshSub.unsubscribe());

    const filterSub = this.shortcutService.filter$.subscribe(() => {
      this.toggleFilter();
    });
    this.destroyRef.onDestroy(() => filterSub.unsubscribe());

    this.loadInitialTodos();
  }

  override ngOnDestroy(): void {
    document.removeEventListener("keydown", this.keydownHandler);
    super.ngOnDestroy();
  }

  getFilteredCount(filter: string): number {
    return this.stateService.getFilteredCount(filter);
  }

  async deleteTodoById(todoId?: string, _isOwner: boolean = true): Promise<void> {
    const confirmed = await this.confirmDialogService.confirm({
      title: "Delete Project",
      message: "Are you sure you want to delete this project?",
      confirmText: "Delete",
      confirmClass: "bg-red-600 hover:bg-red-700",
    });
    if (!confirmed) return;

    const sub = this.apiService.todos.delete(todoId!).subscribe({
      next: () => {
        this.storageService.modify("todos", "delete", { id: todoId });
        this.notifyService.showSuccess("Todo deleted successfully");
      },
      error: (err) => {
        this.notifyService.showError(err.message || "Failed to delete todo");
      },
    });
    this.destroyRef.onDestroy(() => sub.unsubscribe());
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
          this.storageService.updateRecordDeleteStatusWithCascade("todos", todoId!, true);
          this.notifyService.showSuccess("Todo archived successfully");
        } else {
          this.notifyService.showError(response.message || "Failed to archive todo");
        }
        return;
      }

      const sub = this.apiService.todos.delete(todoId!).subscribe({
        next: () => {
          this.storageService.updateRecordDeleteStatusWithCascade("todos", todoId!, true);
          this.notifyService.showSuccess("Todo archived successfully");
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to archive todo");
        },
      });
      this.destroyRef.onDestroy(() => sub.unsubscribe());
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
      const todo = this.storageService.todos().find((t: Todo) => t.id === todoId);
      if (!todo) {
        this.notifyService.showError("Todo not found");
        return;
      }

      if (this.isOffline()) {
        const response = await this.adminService.toggleDeleteStatusLocal("todos", todoId!);
        if (response.status === ResponseStatus.SUCCESS) {
          this.storageService.updateRecordDeleteStatusWithCascade("todos", todoId!, false);
          this.notifyService.showSuccess("Todo restored successfully");
        } else {
          this.notifyService.showError(response.message || "Failed to restore todo");
        }
        return;
      }

      const sub = this.apiService.todos
        .update(todoId!, { deleted_at: undefined } as any, todo.visibility)
        .subscribe({
          next: () => {
            this.storageService.updateRecordDeleteStatusWithCascade("todos", todoId!, false);
            this.notifyService.showSuccess("Todo restored successfully");
          },
          error: (err) => {
            this.notifyService.showError(err.message || "Failed to restore todo");
          },
        });
      this.destroyRef.onDestroy(() => sub.unsubscribe());
    }
  }

  onUpdateTodo(todo: Todo, event: { field: string; value: any }): void {
    const { field, value } = event;
    const sub = this.apiService.todos
      .update(todo.id, { [field]: value }, todo.visibility)
      .subscribe({
        next: (updatedTodo) => {
          this.storageService.modify("todos", "update", { ...updatedTodo, id: todo.id });
          this.notifyService.showSuccess("Project updated successfully");
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to update project");
        },
      });
    this.destroyRef.onDestroy(() => sub.unsubscribe());
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
    switch (action) {
      case "blueprint":
        this.saveAsBlueprint(item);
        break;
      case "edit":
        this.router.navigate(["/todos", item.id, "edit_todo"]);
        break;
      case "archive":
        const archiveConfirmed = await this.confirmDialogService.confirm({
          title: "Archive Project",
          message: "Are you sure you want to archive this project?",
          confirmText: "Archive",
          confirmClass: "bg-orange-600 hover:bg-orange-700",
        });
        if (archiveConfirmed) {
          const sub = this.apiService.todos.delete(item.id).subscribe({
            next: () => {
              this.storageService.updateRecordDeleteStatusWithCascade("todos", item.id, true);
              this.notifyService.showSuccess("Project archived successfully");
            },
            error: (err) =>
              this.notifyService.showError(err.message || "Failed to archive project"),
          });
          this.destroyRef.onDestroy(() => sub.unsubscribe());
        }
        break;
      case "delete":
        this.deleteTodoById(item.id, item.user_id === this.currentUserId);
        break;
    }
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

  toggleTodoSelection(event: { id: string; selected: boolean }): void {
    const { id, selected } = event;
    if (selected) {
      this.lastSelectedId.set(id);
    }
    this.selectedItems.update((todoIds) => {
      const newSelected = new Set(todoIds);
      if (selected) {
        newSelected.add(id);
      } else {
        newSelected.delete(id);
      }
      this.bulkService.setSelectionState(newSelected.size, this.isAllSelected());
      return newSelected;
    });
  }

  override toggleSelectAll(): void {
    super.toggleSelectAll(
      () => this.stateService.listTodos(),
      () => this.isAllSelected()
    );
  }

  onTableSelectAll(selectAll: boolean): void {
    this.selectedItems.update((todoIds) => {
      const newSelected = new Set(todoIds);
      if (selectAll) {
        this.stateService.listTodos().forEach((todo) => newSelected.add(todo.id));
      } else {
        this.stateService.listTodos().forEach((todo) => newSelected.delete(todo.id));
      }
      return newSelected;
    });
  }

  override isAllSelected(): boolean {
    return super.isAllSelected(() => this.stateService.listTodos());
  }

  async bulkArchive(): Promise<void> {
    const selected = this.selectedTodos();
    if (selected.size === 0) return;

    const confirmed = await this.confirmDialogService.confirm({
      title: "Archive Projects",
      message: `Are you sure you want to archive ${selected.size} project(s)?`,
      confirmText: "Archive All",
      confirmClass: "bg-orange-600 hover:bg-orange-700",
    });
    if (confirmed) {
      if (this.isOffline()) {
        let successCount = 0;
        let errorCount = 0;
        for (const todoId of selected) {
          const response = await this.adminService.toggleDeleteStatusLocal("todos", todoId);
          if (response.status === ResponseStatus.SUCCESS) {
            this.storageService.updateRecordDeleteStatusWithCascade("todos", todoId, true);
            successCount++;
          } else {
            errorCount++;
          }
        }
        if (errorCount > 0) {
          this.notifyService.showWarning(
            `Archived ${successCount} project(s), ${errorCount} failed.`
          );
        } else {
          this.notifyService.showSuccess(`${successCount} project(s) archived successfully`);
        }
        this.clearSelection();
        return;
      }

      const selectedArray = Array.from(selected).map((id) => ({ id }));
      const sub = this.bulkActionHelper
        .bulkDelete(selectedArray, (id) => this.apiService.todos.delete(id))
        .subscribe({
          next: (result) => {
            this.clearSelection();
            if (result.errorCount === 0) {
              selected.forEach((todoId) => {
                this.storageService.updateRecordDeleteStatusWithCascade("todos", todoId, true);
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
