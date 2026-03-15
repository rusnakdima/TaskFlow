/* sys lib */
import {
  Component,
  OnInit,
  signal,
  effect,
  computed,
  inject,
  OnDestroy,
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
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { ResponseStatus } from "@models/response.model";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { DataSyncProvider } from "@providers/data-sync.provider";
import { WebSocketService } from "@services/core/websocket.service";
import { NotifyService } from "@services/notifications/notify.service";
import { KanbanDragDropService } from "@services/ui/kanban-drag-drop.service";
import { StorageService } from "@services/core/storage.service";
import { BaseItemHelper } from "@helpers/base-item.helper";

/* components */
import { KanbanTaskCardComponent } from "@components/kanban-task-card/kanban-task-card.component";

@Component({
  selector: "app-kanban",
  standalone: true,
  providers: [DataSyncProvider],
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
  ],
  templateUrl: "./kanban.view.html",
})
export class KanbanView implements OnInit, OnDestroy {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private authService = inject(AuthService);
  private dataSyncProvider = inject(DataSyncProvider);
  private ws = inject(WebSocketService);
  private notifyService = inject(NotifyService);
  private dragDropService = inject(KanbanDragDropService);
  private baseHelper = new BaseItemHelper();
  private storageService = inject(StorageService);
  private cdr = inject(ChangeDetectorRef);

  private routeSub?: Subscription;

  TaskStatus = TaskStatus;

  // Use storage signals directly for source data
  todos = computed(() => this.storageService.todos().filter((todo) => !todo.isDeleted));

  selectedTodoId = signal<string>("");
  loading = signal<boolean>(false);
  expandedTasks = signal<Set<string>>(new Set());

  userId = signal<string>("");
  searchQuery = signal<string>("");

  private isUpdatingOrder = signal<boolean>(false);

  selectedProjectTitle = computed(() => {
    const todoId = this.selectedTodoId();
    const todo = this.todos().find((t) => t.id === todoId);
    return todo?.title || "No Project Selected";
  });

  // Derived tasks for the selected project
  projectTasks = computed(() => {
    const todoId = this.selectedTodoId();
    if (!todoId) return [];
    // Directly access todos and find the matching one, then get its tasks
    const todo = this.storageService.todos().find((t) => t.id === todoId);
    const tasks = todo?.tasks || [];

    // Filter out deleted tasks
    const filteredTasks = tasks.filter((task) => !task.isDeleted);

    // Remove duplicates by ID, keeping the first occurrence
    const uniqueTaskMap = new Map<string, Task>();
    filteredTasks.forEach((task) => {
      if (!uniqueTaskMap.has(task.id)) {
        uniqueTaskMap.set(task.id, task);
      }
    });

    return Array.from(uniqueTaskMap.values());
  });

  columns = [
    { id: TaskStatus.PENDING, label: "To Do", icon: "assignment" },
    { id: TaskStatus.COMPLETED, label: "Done", icon: "check_circle" },
    { id: TaskStatus.SKIPPED, label: "Skipped", icon: "skip_next" },
    { id: TaskStatus.FAILED, label: "Failed", icon: "error" },
  ];

  constructor() {
    effect(() => {
      const todos = this.todos();
      if (todos.length > 0 && !this.selectedTodoId()) {
        const queryProjectId = this.route.snapshot.queryParams["projectId"];
        if (queryProjectId) {
          this.selectedTodoId.set(queryProjectId);
        } else {
          this.selectedTodoId.set(todos[0].id);
        }
      }
    });
  }

  ngOnInit(): void {
    this.userId.set(this.authService.getValueByKey("id"));

    // Handle projectId query param for deep linking
    this.routeSub = this.route.queryParams.subscribe((params) => {
      if (params["projectId"]) {
        this.selectedTodoId.set(params["projectId"]);
      }
    });
  }

  ngOnDestroy(): void {
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

  isTaskExpanded(taskId: string): boolean {
    return this.expandedTasks().has(taskId);
  }

  onToggleExpand(task: Task): void {
    this.toggleExpandTask(task);
  }

  onMoveTask(event: { taskId: string; newStatus: TaskStatus }): void {
    this.moveTaskToStatus(event.taskId, event.newStatus);
  }

  onSubtaskToggleCompletion(subtask: Subtask): void {
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

    const todoId = this.selectedTodoId();
    if (!todoId) return;

    this.dataSyncProvider
      .crud<Subtask>("update", "subtasks", {
        id: subtask.id,
        data: { status: newStatus },
        parentTodoId: todoId,
      })
      .subscribe({
        next: () => {
          // Storage updated automatically by DataSyncProvider
        },
        error: (err: any) => {
          this.notifyService.showError(err.message || "Failed to update subtask");
        },
      });
  }

  getSubtasksForTask(taskId: string): Subtask[] {
    return this.storageService.getSubtasksByTaskId(taskId);
  }

  getCompletedSubtasksCount(taskId: string): number {
    const subtasks = this.getSubtasksForTask(taskId);
    return subtasks.filter(
      (s) => s.status === TaskStatus.COMPLETED || s.status === TaskStatus.SKIPPED
    ).length;
  }

  getTotalSubtasksCount(taskId: string): number {
    return this.getSubtasksForTask(taskId).length;
  }

  onTodoChange(todoId: string) {
    this.selectedTodoId.set(todoId);
    this.expandedTasks.set(new Set()); // Reset expanded tasks
  }

  getTasksByStatus(status: string): Task[] {
    const query = this.searchQuery().toLowerCase().trim();
    return this.projectTasks().filter((t) => {
      const matchesStatus = t.status === status;
      const matchesSearch =
        !query ||
        t.title.toLowerCase().includes(query) ||
        (t.description && t.description.toLowerCase().includes(query));
      return matchesStatus && matchesSearch;
    });
  }

  onSearchChange(query: string) {
    this.searchQuery.set(query);
  }

  clearSearch() {
    this.searchQuery.set("");
  }

  // Delegate UI helper methods to BaseItemHelper
  getColumnColorClass = this.baseHelper.getColumnColorClass;
  getAssigneeColor = this.baseHelper.getAssigneeColor;
  getInitials = this.baseHelper.getInitials;
  formatDate = this.baseHelper.formatDate;
  getTaskProgressPercentage = this.baseHelper.getTaskProgressPercentage;
  getProgressSegments = this.baseHelper.getProgressSegments;
  getConnectedDropLists = (currentColumnId: string) =>
    this.dragDropService.getConnectedDropLists(currentColumnId, this.columns);

  onTaskDrop(event: CdkDragDrop<Task[]>, targetStatus: TaskStatus): void {
    const result = this.dragDropService.handleTaskDrop(
      event,
      targetStatus,
      this.isUpdatingOrder(),
      (taskId, newStatus) => this.moveTaskToStatus(taskId, newStatus)
    );

    // Note: Notification will be shown in moveTaskToStatus after API response
    if (result.moved && result.task) {
      // Visual update happens via transferArrayItem in dragDropService
      // The actual data update and notification will happen after API response
    }
  }

  moveTaskToStatus(taskId: string, newStatus: TaskStatus) {
    const todoId = this.selectedTodoId();
    if (!todoId) return;

    this.dataSyncProvider
      .crud<Task>("update", "tasks", {
        id: taskId,
        data: { status: newStatus },
        parentTodoId: todoId,
      })
      .subscribe({
        next: (updatedTask) => {
          // Force reload of project tasks from storage to ensure UI is updated
          // This is needed because the storage update happens in nested arrays
          setTimeout(() => {
            this.cdr.detectChanges();
          }, 0);
          this.notifyService.showNotify(ResponseStatus.SUCCESS, `Task moved to ${newStatus}`);
        },
        error: (err: any) => {
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
      this.router.navigate(["/todos", todoId, "tasks", task.id, "subtasks"]);
    }
  }
}
