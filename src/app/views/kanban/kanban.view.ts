/* sys lib */
import { Component, OnInit, signal, effect, computed, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router, ActivatedRoute } from "@angular/router";
import { CdkDragDrop, DragDropModule } from "@angular/cdk/drag-drop";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Response, ResponseStatus } from "@models/response.model";

/* services */
import { MainService } from "@services/main.service";
import { AuthService } from "@services/auth.service";
import { DataSyncProvider } from "../../providers/data-sync.provider";
import { LocalWebSocketService } from "@services/local-websocket.service";
import { NotifyService } from "@services/notify.service";
import { KanbanDragDropService } from "@services/kanban-drag-drop.service";
import { KanbanUIHelper } from "@services/kanban-ui-helper.service";

/* controllers */
import { KanbanController } from "@controllers/kanban.controller";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatSelectModule } from "@angular/material/select";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatMenuModule } from "@angular/material/menu";
import { MatButtonModule } from "@angular/material/button";
import { RouterModule } from "@angular/router";

/* components */
import { KanbanTaskCardComponent } from "@components/kanban-task-card/kanban-task-card.component";

@Component({
  selector: "app-kanban",
  standalone: true,
  providers: [DataSyncProvider, KanbanController],
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
  private controller = inject(KanbanController);

  TaskStatus = TaskStatus;
  todos = signal<Todo[]>([]);
  selectedTodoId = signal<string>("");
  tasks = signal<Task[]>([]);
  loading = signal<boolean>(false);
  subtasksMap = signal<Map<string, Subtask[]>>(new Map());
  expandedTasks = signal<Set<string>>(new Set());

  userId = signal<string>("");
  searchQuery = signal<string>("");

  private isUpdatingOrder = signal<boolean>(false);

  selectedProjectTitle = computed(() => {
    const todoId = this.selectedTodoId();
    const todo = this.todos().find((t) => t.id === todoId);
    return todo?.title || "No Project Selected";
  });

  columns = [
    { id: TaskStatus.PENDING, label: "To Do", icon: "assignment" },
    { id: TaskStatus.COMPLETED, label: "Done", icon: "check_circle" },
    { id: TaskStatus.SKIPPED, label: "Skipped", icon: "skip_next" },
    { id: TaskStatus.FAILED, label: "Failed", icon: "error" },
  ];

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService,
    private dataSyncProvider: DataSyncProvider,
    private localWs: LocalWebSocketService,
    private notifyService: NotifyService,
    private dragDropService: KanbanDragDropService,
    private uiHelper: KanbanUIHelper
  ) {
    effect(() => {
      const todoId = this.selectedTodoId();
      if (todoId) {
        this.loadTasksWithSubtasks(todoId);
      }
    });
  }

  ngOnInit(): void {
    this.userId.set(this.authService.getValueByKey("id"));
    this.controller.init(this.userId());

    this.loadTodos();

    // Handle projectId query param for deep linking
    this.route.queryParams.subscribe((params) => {
      if (params["projectId"]) {
        this.selectedTodoId.set(params["projectId"]);
      }
    });

    this.localWs.onEvent("task-updated").subscribe((data) => {
      if (data.todoId === this.selectedTodoId()) {
        this.tasks.update((tasks) => {
          return tasks.map((t) => {
            if (t.id === data.id) {
              return { ...t, ...data };
            }
            return t;
          });
        });
      }
      this.loadTodos();
    });

    this.localWs.onEvent("task-created").subscribe((data) => {
      if (data.todoId === this.selectedTodoId()) {
        this.tasks.update((tasks) => [...tasks, data]);
      }
      this.loadTodos();
    });

    this.localWs.onEvent("task-deleted").subscribe((data) => {
      this.tasks.update((tasks) => tasks.filter((t) => t.id !== data.id));
      this.loadTodos();
    });

    // Listen for subtask events
    this.localWs.onEvent("subtask-updated").subscribe((data) => {
      this.loadSubtasksForTask(data.taskId);
    });

    this.localWs.onEvent("subtask-created").subscribe((data) => {
      this.loadSubtasksForTask(data.taskId);
    });

    this.localWs.onEvent("subtask-deleted").subscribe((data) => {
      this.loadSubtasksForTask(data.taskId);
    });
  }

  async loadTodos() {
    this.controller.loadTodos().subscribe({
      next: (todos) => {
        this.todos.set(todos);
      },
      error: (error) => {
        this.notifyService.showError("Failed to load projects");
      },
    });
  }

  async loadTasksWithSubtasks(todoId: string) {
    this.loading.set(true);
    this.controller.loadTasksWithSubtasks(todoId).subscribe({
      next: (result) => {
        this.tasks.set(result.tasks);
        this.subtasksMap.set(result.subtasksMap);
        this.loading.set(false);
      },
      error: (error) => {
        this.notifyService.showError("Failed to load tasks");
        this.loading.set(false);
      },
    });
  }

  loadSubtasksForTask(taskId: string) {
    this.controller.loadSubtasksForTask(taskId).subscribe({
      next: (subtasks) => {
        this.subtasksMap.update((map) => {
          const newMap = new Map(map);
          newMap.set(taskId, subtasks);
          return newMap;
        });
      },
      error: (error) => {
        console.error("Failed to load subtasks for task:", taskId);
      },
    });
  }

  toggleExpandTask(task: Task) {
    this.expandedTasks.update((set) => {
      const newSet = new Set(set);
      if (newSet.has(task.id)) {
        newSet.delete(task.id);
      } else {
        newSet.add(task.id);
        // Load subtasks if not already loaded
        if (!this.subtasksMap().has(task.id)) {
          this.loadSubtasksForTask(task.id);
        }
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
    const newStatus =
      subtask.status === TaskStatus.COMPLETED
        ? TaskStatus.PENDING
        : subtask.status === TaskStatus.PENDING
          ? TaskStatus.COMPLETED
          : subtask.status === TaskStatus.SKIPPED
            ? TaskStatus.PENDING
            : TaskStatus.PENDING;

    const todoId = this.selectedTodoId();
    const selectedTodo: Todo | undefined = this.todos().find((t) => t.id === todoId);
    if (!selectedTodo) return;

    const isPrivate = selectedTodo.visibility === "private";
    const isOwner = selectedTodo.userId === this.userId();

    const updatedSubtask = { ...subtask, status: newStatus };

    this.dataSyncProvider
      .update<Subtask>("subtask", subtask.id, updatedSubtask, { isOwner, isPrivate }, todoId)
      .subscribe({
        next: () => {
          this.notifyService.showSuccess("Subtask updated");
          this.loadSubtasksForTask(subtask.taskId);
        },
        error: (error) => {
          this.notifyService.showError("Failed to update subtask");
        },
      });
  }

  getSubtasksForTask(taskId: string): Subtask[] {
    return this.subtasksMap().get(taskId) || [];
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
    return this.controller.getTasksByStatus(this.tasks(), status, this.searchQuery());
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
    const selectedTodo: Todo | undefined = this.todos().find((t) => t.id === todoId);
    if (!selectedTodo) {
      console.error("[Kanban] No selected todo found, aborting moveTask");
      return;
    }

    const isPrivate = selectedTodo.visibility === "private";
    const isOwner = selectedTodo.userId === this.userId();

    this.controller.moveTask(taskId, newStatus, todoId, isOwner, isPrivate).subscribe({
      next: () => {
        this.notifyService.showNotify(ResponseStatus.SUCCESS, `Task moved to ${newStatus}`);
        this.tasks.update((tasks) => {
          return tasks.map((t) => {
            if (t.id === taskId) {
              return { ...t, status: newStatus };
            }
            return t;
          });
        });
      },
      error: (error) => {
        console.error("[Kanban] Failed to move task:", error);
        this.notifyService.showError("Failed to move task");
        this.loadTasksWithSubtasks(todoId);
      },
    });
  }

  navigateToTask(task: Task) {
    const todoId = this.selectedTodoId();
    const selectedTodo: Todo | undefined = this.todos().find((t) => t.id === todoId);
    if (!selectedTodo) {
      console.error("[Kanban] No selected todo found, aborting moveTask");
      return;
    }

    const isPrivate = selectedTodo.visibility === "private";
    const isOwner = selectedTodo.userId === this.userId();
    if (todoId && task.id) {
      this.router.navigate(["/todos", todoId, "tasks", task.id, "subtasks"], {
        queryParams: { isPrivate, isOwner },
      });
    }
  }
}
