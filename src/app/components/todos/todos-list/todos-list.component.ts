import {
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
  signal,
  NO_ERRORS_SCHEMA,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router } from "@angular/router";
import { CdkDragDrop, CdkDragEnter, DragDropModule } from "@angular/cdk/drag-drop";

import { MatIconModule } from "@angular/material/icon";

import { Todo, TaskStatus, Comment } from "@models/generated/api.types";
import { TableFieldActionButton, TableField } from "@models/table-field.model";
import { TableViewComponent } from "@components/table-view/table-view.component";

import { EmptyStateComponent } from "@components/empty-state/empty-state.component";
import { ItemExpandDetailsComponent } from "@components/item-expand-details/item-expand-details.component";
import { ItemCardComponent } from "@components/item-card/item-card.component";
import { BulkActionsComponent } from "@components/bulk-actions/bulk-actions.component";
import { SectionSelectAllComponent } from "@components/section-select-all/section-select-all.component";
import { TODO_TABLE_CONFIG, TODO_CARD_CONFIG } from "@shared/utils/constants";
import { TodosStateService } from "../todos-filters/todos-state.service";
import { DragDropOrderService } from "@services/ui/drag-drop-order.service";
import { DragDropHandlerService } from "@services/ui/drag-drop-handler.service";
import { TABLE_ACTIONS } from "@shared/utils/constants";
import { PermissionService, TodoPermission } from "@services/core/permission.service";
import { JwtTokenService } from "@services/auth/jwt-token.service";

@Component({
  selector: "app-todos-list",
  standalone: true,
  schemas: [NO_ERRORS_SCHEMA],
  imports: [
    CommonModule,
    DragDropModule,
    MatIconModule,
    TableViewComponent,
    EmptyStateComponent,
    ItemExpandDetailsComponent,
    BulkActionsComponent,
    ItemCardComponent,
    SectionSelectAllComponent,
  ],
  templateUrl: "./todos-list.component.html",
})
export class TodosListComponent {
  private router = inject(Router);
  private dragDropService = inject(DragDropOrderService);
  private dragDropHandlerService = inject(DragDropHandlerService);
  private permissionService = inject(PermissionService);
  private jwtTokenService = inject(JwtTokenService);
  stateService = inject(TodosStateService);

  permissionMap = signal<Record<string, Record<string, string>>>({});
  loadedPermissions = signal<Set<string>>(new Set());

  expandedTodoIds = signal<Set<string>>(new Set());

  @Input() selectedTodos = signal<Set<string>>(new Set());
  @Input() lastSelectedId = signal<string | null>(null);
  @Input() viewMode: "card" | "grid" | "table" | "list" | "kanban" = "grid";
  @Input() highlightTodoId: string | null = null;
  @Input() userId: string = "";
  @Input() activeVisibility: string = "private";
  @Input() showBulkActions = true;
  @Input() todoPlaceholder: any;
  @Input() dragSource: any;
  @Input() dragTarget: any;
  @Input() dragTargetIndex = 0;
  @Input() dragSourceIndex = 0;
  @Input() dragRef: any;
  @Input() isAllSelected = false;

  @Output() todoDeleted = new EventEmitter<{ id: string; isOwner: boolean; visibility?: string }>();
  @Output() todoArchived = new EventEmitter<string>();
  @Output() todoRestored = new EventEmitter<string>();
  @Output() todoSavedAsBlueprint = new EventEmitter<Todo>();
  @Output() todoUpdated = new EventEmitter<{ todo: Todo; event: { field: string; value: any } }>();
  @Output() todoCardClicked = new EventEmitter<{ event: MouseEvent; id: string }>();
  @Output() selectionChanged = new EventEmitter<{ id: string; selected: boolean }>();
  @Output() selectAll = new EventEmitter<{
    selectAll: boolean;
    section?: "private" | "shared" | "public";
  }>();
  @Output() clearSelection = new EventEmitter<void>();
  @Output() bulkArchive = new EventEmitter<void>();
  @Output() rangeSelect = new EventEmitter<{ anchorId: string; targetId: string }>();
  @Output() additiveSelect = new EventEmitter<string>();
  @Output() rowClick = new EventEmitter<any>();
  @Output() tableAction = new EventEmitter<{ action: string; item: any }>();
  @Output() todoDropped = new EventEmitter<CdkDragDrop<Todo[]>>();
  @Output() todoListDropped = new EventEmitter<CdkDragDrop<Todo[]>>();

  todoTableFields: TableField[] = [
    { key: "title", label: "Project", type: "text", sortable: true },
    { key: "priority", label: "Priority", type: "priority", sortable: true },
    {
      key: "status",
      label: "Status",
      type: "status",
      getValue: (item) => this.computeTodoStatus(item as unknown as Todo),
    },
    { key: "tasks", label: "Tasks", type: "number", getValue: (item) => String(item['tasks_count'] || 0) },
  ];

  tableActions: TableFieldActionButton[] = [
    TABLE_ACTIONS.BLUEPRINT,
    TABLE_ACTIONS.EDIT,
    TABLE_ACTIONS.ARCHIVE,
  ];

  todoTableConfig = TODO_TABLE_CONFIG;
  todoCardConfig = TODO_CARD_CONFIG;

  expandedCommentsIds = signal<Set<string>>(new Set());

  computeTodoStatus(todo: Todo): string {
    const tasks = this.stateService["storageService"].getTasksByTodoId(todo.id);
    if (!tasks || tasks.length === 0) return "Pending";
    const pending = tasks.filter((t) => t.status === TaskStatus.PENDING).length;
    const completed = tasks.filter(
      (t) => t.status === TaskStatus.COMPLETED || t.status === TaskStatus.SKIPPED
    ).length;
    if (completed === tasks.length) return "Completed";
    if (pending === tasks.length) return "Pending";
    return "In Progress";
  }

  getTodoUnreadCommentsCount(todo: Todo): number {
    const storage = this.stateService["storageService"];
    const userId = this.userId;
    const tasks = storage.getTasksByTodoId(todo.id);
    if (!userId || tasks.length === 0) return 0;

    let count = 0;
    const comments = storage.comments();
    for (const task of tasks) {
      const taskComments = comments.filter((c: Comment) => c.task_id === task.id && !c.deleted_at);
      if (taskComments.length === 0) continue;
      count += taskComments.filter((c: Comment) => {
        if (c.user_id === userId) return false;
        if (c.read_by && c.read_by.includes(userId)) return false;
        if (c.subtask_id) return false;
        return true;
      }).length;
    }
    return count;
  }

  onTodoListEntered(event: CdkDragEnter): void {
    const { item, container } = event;
    if (container === this.todoPlaceholder) return;
    if (!this.todoPlaceholder?.element?.nativeElement) return;

    const placeholderEl = this.todoPlaceholder.element.nativeElement as HTMLElement;
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

    this.todoPlaceholder._dropListRef.enter(
      item._dragRef,
      item.element.nativeElement.offsetLeft,
      item.element.nativeElement.offsetTop
    );
  }

  onTodoListDropped(_event: CdkDragDrop<Todo[]>): void {
    this.dragDropHandlerService.onListDropped(
      this.todoPlaceholder,
      (prev: number, curr: number) => {
        if (prev !== curr) {
          const syntheticEvent = {
            previousIndex: prev,
            currentIndex: curr,
            item: null,
            container: null,
            previousContainer: null,
            distance: { x: 0, y: 0 },
          } as unknown as CdkDragDrop<Todo[]>;
          const todos =
            this.stateService.activeVisibility() === "all"
              ? this.stateService.allTodosFlat()
              : this.stateService.listTodos();
          this.dragDropService.handleDrop(syntheticEvent, todos, "todos", "todos").subscribe();
        }
      }
    );
  }

  onTodoDrop(event: CdkDragDrop<Todo[]>): void {
    const todos =
      this.stateService.activeVisibility() === "all"
        ? this.stateService.allTodosFlat()
        : this.stateService.listTodos();
    this.dragDropService.handleDrop(event, todos, "todos", "todos").subscribe();
  }

  onCardClick(event: { event: MouseEvent; id: string; visibility?: string }): void {
    if (event.event.shiftKey) {
      const anchorId = this.lastSelectedId();
      if (anchorId) {
        this.rangeSelect.emit({ anchorId, targetId: event.id });
        return;
      }
    } else if (event.event.ctrlKey || event.event.metaKey) {
      this.selectionChanged.emit({ id: event.id, selected: true });
      this.lastSelectedId.set(event.id);
      return;
    }

    this.lastSelectedId.set(event.id);
    this.router.navigate(["/todos", event.id, "tasks"], {
      queryParams: { visibility: event.visibility || this.activeVisibility },
    });
  }

  onRowClick(event: { event: MouseEvent; item: any } | any): void {
    const item = event.item || event;
    const mouseEvent = event.event;

    if (mouseEvent?.shiftKey) {
      const anchorId = this.lastSelectedId();
      if (anchorId) {
        this.rangeSelect.emit({ anchorId, targetId: item.id });
        return;
      }
    } else if (mouseEvent?.ctrlKey || mouseEvent?.metaKey) {
      this.selectionChanged.emit({ id: item.id, selected: true });
      this.lastSelectedId.set(item.id);
      return;
    }

    this.lastSelectedId.set(item.id);
    this.router.navigate(["/todos", item.id, "tasks"], {
      queryParams: { visibility: item.visibility || this.activeVisibility },
    });
  }

  toggleTodoSelection(event: { id: string; selected: boolean }): void {
    if (event.selected) {
      this.lastSelectedId.set(event.id);
    }
    this.selectionChanged.emit(event);
  }

  onTodoAction(event: { action: string; item: Todo }): void {
    const perm = this.getUserTodoPermission(event.item);
    switch (event.action) {
      case "archive":
        if (perm !== TodoPermission.OWNER) {
          return;
        }
        this.todoArchived.emit(event.item.id);
        break;
      case "restore":
        if (perm !== TodoPermission.OWNER) {
          return;
        }
        this.todoRestored.emit(event.item.id);
        break;
      case "blueprint":
        if (event.item.user_id !== this.userId) {
          return;
        }
        this.todoSavedAsBlueprint.emit(event.item);
        break;
      case "delete":
        if (perm !== TodoPermission.OWNER) {
          return;
        }
        this.todoDeleted.emit({
          id: event.item.id,
          isOwner: event.item.user_id === this.userId,
          visibility: event.item.visibility,
        });
        break;
      default:
        this.tableAction.emit(event);
    }
  }

  onTodoCardClick(event: { event: MouseEvent; id: string; visibility?: string }): void {
    if (event.event.shiftKey) {
      const anchorId = this.lastSelectedId();
      if (anchorId) {
        this.rangeSelect.emit({ anchorId, targetId: event.id });
        return;
      }
    } else if (event.event.ctrlKey || event.event.metaKey) {
      this.selectionChanged.emit({ id: event.id, selected: true });
      this.lastSelectedId.set(event.id);
      return;
    }

    this.lastSelectedId.set(event.id);
    this.router.navigate(["/todos", event.id, "tasks"], {
      queryParams: { visibility: event.visibility || this.activeVisibility },
    });
  }

  onTodoCardAction(event: { action: string; item: Todo }): void {
    const todo = event.item;
    const perm = this.getUserTodoPermission(todo);
    switch (event.action) {
      case "archive":
        if (perm !== TodoPermission.OWNER) {
          return;
        }
        this.todoArchived.emit(todo.id);
        break;
      case "restore":
        if (perm !== TodoPermission.OWNER) {
          return;
        }
        this.todoRestored.emit(todo.id);
        break;
      case "blueprint":
        if (todo.user_id !== this.userId) {
          return;
        }
        this.todoSavedAsBlueprint.emit(todo);
        break;
      case "delete":
        if (perm !== TodoPermission.OWNER) {
          return;
        }
        this.todoDeleted.emit({
          id: todo.id,
          isOwner: todo.user_id === this.userId,
          visibility: todo.visibility,
        });
        break;
      default:
        this.tableAction.emit({ action: event.action, item: todo });
    }
  }

  toggleTodoExpand(todo: Todo): void {
    this.expandedTodoIds.update((set) => {
      const newSet = new Set(set);
      if (newSet.has(todo.id)) {
        newSet.delete(todo.id);
      } else {
        newSet.add(todo.id);
      }
      return newSet;
    });
  }

  toggleTodoComments(todoId: string): void {
    this.expandedCommentsIds.update((set) => {
      const newSet = new Set(set);
      if (newSet.has(todoId)) {
        newSet.delete(todoId);
      } else {
        newSet.add(todoId);
      }
      return newSet;
    });
  }

  isTodoExpanded(todoId: string): boolean {
    return this.expandedTodoIds().has(todoId);
  }

  isCommentsExpanded(todoId: string): boolean {
    return this.expandedCommentsIds().has(todoId);
  }

  async loadTodoPermissions(todo: Todo): Promise<TodoPermission> {
    const userId = this.userId;

    if (todo.user_id === userId) {
      return TodoPermission.OWNER;
    }

    if ((todo as any).assignee_roles && (todo as any).assignee_roles[userId]) {
      return this.permissionService.fromStr((todo as any).assignee_roles[userId]);
    }

    if (this.loadedPermissions().has(todo.id)) {
      const roles = this.permissionMap()[todo.id] || {};
      const role = roles[userId] || "viewer";
      return this.permissionService.fromStr(role);
    }

    if (todo.visibility === "shared") {
      const token = this.jwtTokenService.getToken() || "";
      const roles = await this.permissionService.getTodoPermissionsAsync(
        todo.id,
        todo.visibility,
        token
      );

      this.permissionMap.update((m) => ({ ...m, [todo.id]: roles }));
      this.loadedPermissions.update((s) => new Set(s).add(todo.id));

      const role = roles[userId] || "viewer";
      return this.permissionService.fromStr(role);
    }

    return TodoPermission.VIEWER;
  }

  getUserTodoPermission(todo: Todo): TodoPermission {
    if (todo.user_id === this.userId) {
      return TodoPermission.OWNER;
    }

    if (
      this.permissionService.isGlobalAdmin() &&
      (todo.visibility === "public" || todo.visibility === "shared")
    ) {
      return TodoPermission.MODERATOR;
    }

    if ((todo as any).assignee_roles && (todo as any).assignee_roles[this.userId]) {
      return this.permissionService.fromStr((todo as any).assignee_roles[this.userId]);
    }

    const roles = this.permissionMap()[todo.id];
    if (roles) {
      const role = roles[this.userId] || "viewer";
      return this.permissionService.fromStr(role);
    }
    return TodoPermission.VIEWER;
  }

  isBlueprintDisabled(todo: Todo): boolean {
    return todo.user_id !== this.userId;
  }

  getGroupedTodos() {
    return this.stateService.groupedTodos();
  }

  getSelectedCountInSection(section: "private" | "shared" | "public"): number {
    const sectionTodos = this.stateService.groupedTodos()[section];
    return sectionTodos.filter((todo: Todo) => this.selectedTodos().has(todo.id)).length;
  }

  isAllSelectedInSection(section: "private" | "shared" | "public"): boolean {
    const sectionTodos = this.stateService.groupedTodos()[section];
    return (
      sectionTodos.length > 0 &&
      sectionTodos.every((todo: Todo) => this.selectedTodos().has(todo.id))
    );
  }

  onSectionSelectAll(section: "private" | "shared" | "public", checked: boolean): void {
    this.selectAll.emit({ selectAll: checked, section });
  }

  isAllSelectedInVisibility(): boolean {
    const todos = this.stateService.listTodos();
    return todos.length > 0 && todos.every((todo: Todo) => this.selectedTodos().has(todo.id));
  }

  getSelectedCountInVisibility(): number {
    const todos = this.stateService.listTodos();
    return todos.filter((todo: Todo) => this.selectedTodos().has(todo.id)).length;
  }

  onVisibilitySelectAll(checked: boolean): void {
    this.selectAll.emit({ selectAll: checked, section: undefined });
  }

  getSectionTodos(section: string): Todo[] {
    const grouped = this.stateService.groupedTodos();
    switch (section) {
      case "private":
        return grouped.private;
      case "shared":
        return grouped.shared;
      case "public":
        return grouped.public;
      default:
        return [];
    }
  }

  getSectionIcon(section: string): string {
    switch (section) {
      case "private":
        return "lock";
      case "shared":
        return "group";
      case "public":
        return "public";
      default:
        return "folder";
    }
  }

  getSectionLabel(section: string): string {
    switch (section) {
      case "private":
        return "Private";
      case "shared":
        return "Shared";
      case "public":
        return "Public";
      default:
        return section;
    }
  }
}
