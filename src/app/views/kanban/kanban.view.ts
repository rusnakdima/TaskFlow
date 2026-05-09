/* sys lib */
import {
  Component,
  OnInit,
  signal,
  effect,
  computed,
  inject,
  ChangeDetectorRef,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router, ActivatedRoute, RouterModule } from "@angular/router";
import { CdkDragDrop, DragDropModule } from "@angular/cdk/drag-drop";
import { Subscription } from "rxjs";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatSelectModule } from "@angular/material/select";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatMenuModule } from "@angular/material/menu";
import { MatButtonModule } from "@angular/material/button";

/* models */
import { Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { ResponseStatus } from "@models/response.model";

/* services */
import { KanbanDragDropService } from "@services/ui/kanban-drag-drop.service";
import { REQUEST_SERVICE } from "@services/api.service";
import { BaseItemHelper } from "@helpers/base-item.helper";
import { DateHelper } from "@helpers/date.helper";
import { DEFAULT_CACHE_TTL_MS } from "@helpers/index";
import { STATUS_ICONS, STATUS_BG_COLORS } from "@constants/table-field.constants";

/* views */
import { BaseListView } from "@views/base-list.view";

/* components */
import { KanbanTaskCardComponent } from "@components/kanban-task-card/kanban-task-card.component";
import { StatsCardComponent } from "@components/stats-card/stats-card.component";
import { EmptyStateComponent } from "@components/empty-state/empty-state.component";
import { FilterField } from "@models/filter-config.model";
import {
  PageToolbarComponent,
  PageToolbarConfig,
} from "@components/page-toolbar/page-toolbar.component";
import {
  SegmentSelectorComponent,
  SegmentOption,
} from "@components/segment-selector/segment-selector.component";

@Component({
  selector: "app-kanban",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DragDropModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule,
    MatMenuModule,
    MatButtonModule,
    RouterModule,
    KanbanTaskCardComponent,
    StatsCardComponent,
    EmptyStateComponent,
    PageToolbarComponent,
    SegmentSelectorComponent,
  ],
  templateUrl: "./kanban.view.html",
})
export class KanbanView extends BaseListView implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private requestService = inject(REQUEST_SERVICE);
  private dragDropService = inject(KanbanDragDropService);
  private cdr = inject(ChangeDetectorRef);

  protected getItems(): { id: string }[] {
    return [];
  }

  private routeSub?: Subscription;

  TaskStatus = TaskStatus;

  todos = computed(() => this.storageService.todos());

  selectedTodo = computed(() => {
    const todoId = this.selectedTodoId();
    return this.todos().find((t) => t.id === todoId) ?? null;
  });

  selectedTodoId = signal<string>("");
  expandedTasks = signal<Set<string>>(new Set());

  private isUpdatingOrder = signal<boolean>(false);
  showStats = signal(false);
  override showFilter = signal(false);

  selectedProjectTitle = computed(() => {
    const todoId = this.selectedTodoId();
    const todo = this.todos().find((t) => t.id === todoId);
    return todo?.title || "No Project Selected";
  });

  projectTasks = computed(() => {
    const todoId = this.selectedTodoId();
    if (!todoId) return [];
    return this.storageService.tasksByTodoId().get(todoId) || [];
  });

  columns: { id: string; label: string; icon: string; iconBgClass: string }[] = [
    {
      id: TaskStatus.PENDING,
      label: "To Do",
      icon: STATUS_ICONS[TaskStatus.PENDING],
      iconBgClass: STATUS_BG_COLORS[TaskStatus.PENDING],
    },
    {
      id: TaskStatus.COMPLETED,
      label: "Done",
      icon: STATUS_ICONS[TaskStatus.COMPLETED],
      iconBgClass: STATUS_BG_COLORS[TaskStatus.COMPLETED],
    },
    {
      id: TaskStatus.SKIPPED,
      label: "Skipped",
      icon: STATUS_ICONS[TaskStatus.SKIPPED],
      iconBgClass: STATUS_BG_COLORS[TaskStatus.SKIPPED],
    },
    {
      id: TaskStatus.FAILED,
      label: "Failed",
      icon: STATUS_ICONS[TaskStatus.FAILED],
      iconBgClass: STATUS_BG_COLORS[TaskStatus.FAILED],
    },
  ];

  todoSelectorOptions = computed<SegmentOption[]>(() =>
    this.todos().map((todo) => ({
      id: todo.id,
      label: todo.title,
      icon: this.selectedTodoId() === todo.id ? "check_circle" : "circle",
    }))
  );

  filterFields: FilterField[] = [
    {
      key: "status",
      label: "Status",
      type: "checkbox",
      options: [
        { key: TaskStatus.PENDING, label: "To Do" },
        { key: TaskStatus.COMPLETED, label: "Done" },
        { key: TaskStatus.SKIPPED, label: "Skipped" },
        { key: TaskStatus.FAILED, label: "Failed" },
      ],
    },
  ];

  constructor() {
    super();
    effect(() => {
      const todos = this.todos();
      const selectedId = this.selectedTodoId();
      if (todos.length > 0 && !selectedId) {
        const queryProjectId = this.route.snapshot.queryParams["projectId"];
        const targetTodoId = queryProjectId || todos[0].id;
        this.selectedTodoId.set(targetTodoId);
      }
    });
  }

  override ngOnInit(): void {
    super.ngOnInit();

    this.requestService.getAll("todos", { visibility: "all", limit: 20, skip: 0 }).subscribe({
      next: () => {},
      error: () => this.notifyService.showError("Failed to load todos"),
    });
  }

  override ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
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

  isTaskExpanded(taskId?: string): boolean {
    return taskId ? this.expandedTasks().has(taskId) : false;
  }

  onToggleExpand(task: Task): void {
    const isExpanded = this.expandedTasks().has(task.id);

    this.expandedTasks.update((set) => {
      const newSet = new Set(set);
      if (isExpanded) {
        newSet.delete(task.id);
      } else {
        newSet.add(task.id);
        this.loadSubtasksIfNeeded(task.id);
      }
      return newSet;
    });
  }

  private loadSubtasksIfNeeded(taskId: string): void {
    const existingSubtasks = this.storageService.subtasksByTaskId().get(taskId) || [];
    if (existingSubtasks.length > 0) return;

    this.requestService
      .getAll("subtasks", {
        filter: { task_id: taskId },
        visibility: "private",
        limit: 20,
        skip: 0,
      })
      .subscribe({
        next: () => {},
        error: () => {
          this.notifyService.showError("Failed to load subtasks for task");
        },
      });
  }

  onMoveTask(event: { taskId: string; newStatus: TaskStatus }): void {
    if (event.taskId) {
      this.moveTaskToStatus(event.taskId, event.newStatus);
    }
  }

  onToggleTaskStatus(task: Task): void {
    const newStatus = BaseItemHelper.getNextStatus(task.status);
    this.moveTaskToStatus(task.id, newStatus);
  }

  onSubtaskToggleCompletion(subtask: Subtask): void {
    const newStatus = BaseItemHelper.getNextStatus(subtask.status);

    const todoId = this.selectedTodoId();
    if (!todoId) return;

    const visibility = (this.selectedTodo()?.visibility ?? "private") as
      | "private"
      | "shared"
      | "public";

    this.requestService
      .update("subtasks", subtask.id, { status: newStatus }, { visibility })
      .subscribe({
        next: () => {},
        error: (err: any) => {
          this.notifyService.showError(err.message || "Failed to update subtask");
        },
      });
  }

  getSubtasksForTask(taskId?: string): Subtask[] {
    if (!taskId) return [];
    return this.storageService.subtasksByTaskId().get(taskId) || [];
  }

  getCompletedSubtasksCount(taskId?: string): number {
    const subtasks = this.getSubtasksForTask(taskId);
    return subtasks.filter(
      (s) => s.status === TaskStatus.COMPLETED || s.status === TaskStatus.SKIPPED
    ).length;
  }

  getTotalSubtasksCount(taskId?: string): number {
    return this.getSubtasksForTask(taskId).length;
  }

  onTodoChange(todoId?: string) {
    if (todoId) {
      this.selectedTodoId.set(todoId);
      this.expandedTasks.set(new Set());
      const cachedTasks = this.storageService.tasksByTodoId().get(todoId) || [];
      if (cachedTasks.length === 0 || !this.storageService.isCacheValid(DEFAULT_CACHE_TTL_MS)) {
        this.loadTasksForTodo(todoId);
      }
    }
  }

  private loadTasksForTodo(todoId: string, forceRefresh = false): void {
    if (!forceRefresh) {
      const cachedTasks = this.storageService.tasksByTodoId().get(todoId) || [];
      if (cachedTasks.length > 0 && this.storageService.isCacheValid(DEFAULT_CACHE_TTL_MS)) {
        return;
      }
    }

    this.requestService
      .getAll("tasks", { filter: { todo_id: todoId }, visibility: "private", limit: 20, skip: 0 })
      .subscribe({
        next: () => {},
        error: () => this.notifyService.showError("Failed to load tasks"),
      });
  }

  getTasksByStatus(status: string): Task[] {
    const query = this.searchQuery().toLowerCase().trim();
    const filters = this._kanbanFilters();
    const statusFilter = filters["status"];

    return this.projectTasks().filter((t) => {
      const matchesStatus = t.status === status;

      if (statusFilter && Array.isArray(statusFilter) && statusFilter.length > 0) {
        if (!statusFilter.includes(t.status)) return false;
      }

      const matchesSearch =
        !query ||
        t.title.toLowerCase().includes(query) ||
        (t.description && t.description.toLowerCase().includes(query));
      return matchesStatus && matchesSearch;
    });
  }

  clearSearch() {
    this.searchQuery.set("");
  }

  onKanbanFilterChange(filters: Record<string, string | string[]>): void {
    this._kanbanFilters.set(filters);
  }

  private _kanbanFilters = signal<Record<string, string | string[]>>({});

  getColumnColorClass = BaseItemHelper.getColumnColorClass;
  getAssigneeColor = BaseItemHelper.getAssigneeColor;
  getInitials = BaseItemHelper.getInitials;
  formatDate = DateHelper.formatDateShort;
  getTaskProgressPercentage = BaseItemHelper.getTaskProgressPercentage;
  getProgressSegments = BaseItemHelper.getProgressSegments;
  getConnectedDropLists = (currentColumnId: string) =>
    this.dragDropService.getConnectedDropLists(currentColumnId, this.columns as any);

  onTaskDrop(event: CdkDragDrop<Task[]>, targetStatus: TaskStatus): void {
    const result = this.dragDropService.handleTaskDrop(
      event,
      targetStatus,
      this.isUpdatingOrder(),
      (newStatus, taskId) => {
        if (taskId) {
          this.moveTaskToStatus(taskId, newStatus);
        }
      }
    );

    if (result.moved && result.task) {
    }
  }

  moveTaskToStatus(taskId: string, newStatus: TaskStatus) {
    const todoId = this.selectedTodoId();
    if (!todoId || !taskId) return;

    if (this.isUpdatingOrder()) {
      this.notifyService.showWarning("Please wait for previous operation to complete");
      return;
    }

    this.isUpdatingOrder.set(true);

    const task = this.projectTasks().find((t) => t.id === taskId);
    const visibility = (this.selectedTodo()?.visibility ?? "private") as
      | "private"
      | "shared"
      | "public";
    if (!task) {
      this.isUpdatingOrder.set(false);
      return;
    }

    this.requestService.update("tasks", taskId, { status: newStatus }, { visibility }).subscribe({
      next: () => {
        this.isUpdatingOrder.set(false);
        setTimeout(() => {
          this.cdr.detectChanges();
        }, 0);
        this.notifyService.showNotify(ResponseStatus.SUCCESS, `Task moved to ${newStatus}`);
      },
      error: (err: any) => {
        this.isUpdatingOrder.set(false);
        this.notifyService.showError(err.message || "Failed to update task");
        setTimeout(() => {
          this.cdr.detectChanges();
        }, 0);
      },
    });
  }

  navigateToTask(task: Task) {
    const todoId = this.selectedTodoId();
    if (todoId && task.id) {
      this.router.navigate(["/todos", todoId, "tasks", task.id]);
    }
  }

  onTodoSelect(todoId: string): void {
    this.selectedTodoId.set(todoId);
    this.expandedTasks.set(new Set());
    this.loadTasksForTodo(todoId);
  }

  onStatsToggle(): void {
    this.showStats.set(!this.showStats());
  }

  getToolbarConfig(): PageToolbarConfig {
    return {
      stats: {
        onToggle: () => this.onStatsToggle(),
        isActive: this.showStats(),
      },
      search: {
        query: this.searchQuery(),
        placeholder: "Search tasks...",
        onSearch: (query) => this.searchQuery.set(query),
      },
    };
  }
}
