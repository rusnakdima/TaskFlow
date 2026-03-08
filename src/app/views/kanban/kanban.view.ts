/* sys lib */
import { Component, OnInit, signal, effect, computed, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router, ActivatedRoute, RouterModule } from "@angular/router";
import { CdkDragDrop, DragDropModule } from "@angular/cdk/drag-drop";

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
import { AuthService } from "@services/auth.service";
import { DataSyncProvider } from "@providers/data-sync.provider";
import { LocalWebSocketService } from "@services/local-websocket.service";
import { NotifyService } from "@services/notify.service";
import { KanbanDragDropService } from "@services/kanban-drag-drop.service";
import { KanbanUIHelper } from "@services/kanban-ui-helper.service";
import { StorageService } from "@services/storage.service";

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
export class KanbanView implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private authService = inject(AuthService);
  private dataSyncProvider = inject(DataSyncProvider);
  private localWs = inject(LocalWebSocketService);
  private notifyService = inject(NotifyService);
  private dragDropService = inject(KanbanDragDropService);
  private uiHelper = inject(KanbanUIHelper);
  private storageService = inject(StorageService);

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
    return this.storageService
      .getTasksByTodoId(todoId)()
      .filter((task) => !task.isDeleted);
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
    this.route.queryParams.subscribe((params) => {
      if (params["projectId"]) {
        this.selectedTodoId.set(params["projectId"]);
      }
    });
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
    let message = "";
    switch (subtask.status) {
      case TaskStatus.PENDING:
        newStatus = TaskStatus.COMPLETED;
        message = "Subtask completed";
        break;
      case TaskStatus.COMPLETED:
        newStatus = TaskStatus.SKIPPED;
        message = "Subtask skipped";
        break;
      case TaskStatus.SKIPPED:
        newStatus = TaskStatus.FAILED;
        message = "Subtask marked as failed";
        break;
      case TaskStatus.FAILED:
      default:
        newStatus = TaskStatus.PENDING;
        message = "Subtask reopened";
        break;
    }

    const todoId = this.selectedTodoId();
    if (!todoId) return;

    const updatedSubtask = { ...subtask, status: newStatus };

    // Optimistic update: update cache immediately
    this.storageService.updateSubtask(subtask.id, { status: newStatus });

    this.dataSyncProvider
      .update<Subtask>("subtasks", subtask.id, updatedSubtask, undefined, todoId)
      .subscribe({
        next: () => {
          this.notifyService.showSuccess(message);
        },
        error: (error) => {
          this.notifyService.showError("Failed to update subtask");
          // Revert on error
          this.storageService.updateSubtask(subtask.id, { status: subtask.status });
        },
      });
  }

  getSubtasksForTask(taskId: string): Subtask[] {
    return this.storageService.getSubtasksByTaskId(taskId)();
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

  // Delegate UI helper methods to KanbanUIHelper
  getColumnColorClass = this.uiHelper.getColumnColorClass;
  getAssigneeColor = this.uiHelper.getAssigneeColor;
  getInitials = this.uiHelper.getInitials;
  formatDate = this.uiHelper.formatDate;
  getTaskProgressPercentage = this.uiHelper.getTaskProgressPercentage;
  getTaskProgressSegments = this.uiHelper.getTaskProgressSegments;
  getConnectedDropLists = (currentColumnId: string) =>
    this.dragDropService.getConnectedDropLists(currentColumnId, this.columns);

  onTaskDrop(event: CdkDragDrop<Task[]>, targetStatus: TaskStatus): void {
    const result = this.dragDropService.handleTaskDrop(
      event,
      targetStatus,
      this.isUpdatingOrder(),
      (taskId, newStatus) => this.moveTaskToStatus(taskId, newStatus)
    );

    if (result.moved && result.task) {
      this.notifyService.showNotify(ResponseStatus.SUCCESS, `Task moved to ${result.newStatus}`);
    }
  }

  moveTaskToStatus(taskId: string, newStatus: TaskStatus) {
    if (!this.userId()) {
      console.error("[Kanban] No userId found, aborting moveTask");
      return;
    }

    const todoId = this.selectedTodoId();
    if (!todoId) {
      console.error("[Kanban] No selected todo found, aborting moveTask");
      return;
    }

    const originalTask = this.storageService.getTaskById(taskId);

    this.dataSyncProvider
      .update<Task>("tasks", taskId, { id: taskId, status: newStatus, todoId }, undefined, todoId)
      .subscribe({
        next: () => {
          this.notifyService.showNotify(ResponseStatus.SUCCESS, `Task moved to ${newStatus}`);
          this.storageService.updateTask(taskId, { status: newStatus });
        },
        error: (error) => {
          console.error("[Kanban] Failed to move task:", error);
          this.notifyService.showError("Failed to move task");
          // Revert on error
          if (originalTask) {
            this.storageService.updateTask(taskId, { status: originalTask.status });
          }
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
