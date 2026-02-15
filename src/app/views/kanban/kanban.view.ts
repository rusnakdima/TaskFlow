/* sys lib */
import { Component, OnInit, signal, effect, computed } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router, ActivatedRoute } from "@angular/router";
import {
  CdkDragDrop,
  DragDropModule,
  moveItemInArray,
  transferArrayItem,
} from "@angular/cdk/drag-drop";

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
    private mainService: MainService,
    private authService: AuthService,
    private dataSyncProvider: DataSyncProvider,
    private localWs: LocalWebSocketService,
    private notifyService: NotifyService
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
    const userId = this.authService.getValueByKey("id");
    if (!userId) return;

    this.dataSyncProvider.getAll<Todo>("todo", { userId }).subscribe({
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
    const userId = this.authService.getValueByKey("id");
    this.dataSyncProvider.getAll<Task>("task", { todoId, userId }).subscribe({
      next: (tasks) => {
        this.tasks.set(tasks);
        // Load subtasks for each task
        tasks.forEach((task) => {
          this.loadSubtasksForTask(task.id);
        });
        this.loading.set(false);
      },
      error: (error) => {
        this.notifyService.showError("Failed to load tasks");
        this.loading.set(false);
      },
    });
  }

  loadSubtasksForTask(taskId: string) {
    this.dataSyncProvider.getAll<Subtask>("subtask", { taskId }).subscribe({
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
    this.moveTask(event.taskId, event.newStatus);
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
    const query = this.searchQuery().toLowerCase().trim();
    return this.tasks().filter((t) => {
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

  moveTask(taskId: string, newStatus: TaskStatus) {
    if (!this.userId()) {
      console.error("[Kanban] No userId found, aborting moveTask");
      return;
    }

    const todoId = this.selectedTodoId();

    this.tasks.update((tasks) => {
      return tasks.map((t) => {
        if (t.id === taskId) {
          return { ...t, status: newStatus };
        }
        return t;
      });
    });

    const selectedTodo: Todo | undefined = this.todos().find((t) => t.id === todoId);
    if (!selectedTodo) {
      console.error("[Kanban] No selected todo found, aborting moveTask");
      return;
    }

    const isPrivate = selectedTodo.visibility === "private";
    const isOwner = selectedTodo.userId === this.userId();

    this.dataSyncProvider
      .update("task", taskId, { status: newStatus, todoId }, { isOwner, isPrivate }, todoId)
      .subscribe({
        next: (updatedTask: any) => {
          this.notifyService.showNotify(ResponseStatus.SUCCESS, `Task moved to ${newStatus}`);

          if (updatedTask && typeof updatedTask === "object") {
            this.tasks.update((tasks) => {
              return tasks.map((t) => {
                if (t.id === taskId) {
                  return { ...t, status: newStatus };
                }
                return t;
              });
            });
          }
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

  getColumnColorClass(status: string): string {
    switch (status) {
      case TaskStatus.PENDING:
        return "bg-linear-to-r from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700";
      case TaskStatus.COMPLETED:
        return "bg-linear-to-r from-green-500 to-green-600 dark:from-green-600 dark:to-green-700";
      case TaskStatus.SKIPPED:
        return "bg-linear-to-r from-yellow-500 to-yellow-600 dark:from-yellow-600 dark:to-yellow-700";
      case TaskStatus.FAILED:
        return "bg-linear-to-r from-red-500 to-red-600 dark:from-red-600 dark:to-red-700";
      default:
        return "bg-linear-to-r from-gray-500 to-gray-600 dark:from-gray-600 dark:to-gray-700";
    }
  }

  getAssigneeColor(assignee: string): string {
    const colors = [
      "bg-blue-500",
      "bg-green-500",
      "bg-purple-500",
      "bg-orange-500",
      "bg-pink-500",
      "bg-teal-500",
      "bg-indigo-500",
      "bg-red-500",
    ];

    let hash = 0;
    for (let i = 0; i < assignee.length; i++) {
      hash = assignee.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  getInitials(name: string): string {
    if (!name) return "?";
    return name.substring(0, 1).toUpperCase();
  }

  getConnectedDropLists(currentColumnId: string): string[] {
    return this.columns
      .filter((col) => col.id !== currentColumnId)
      .map((col) => "cdk-drop-list-" + col.id);
  }

  formatDate(dateString: string): string {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  getTaskProgressPercentage(task: Task): number {
    const subtasks = this.getSubtasksForTask(task.id);
    if (subtasks.length === 0) {
      return task.status === TaskStatus.COMPLETED || task.status === TaskStatus.SKIPPED ? 100 : 0;
    }
    const completed = subtasks.filter(
      (s) => s.status === TaskStatus.COMPLETED || s.status === TaskStatus.SKIPPED
    ).length;
    return Math.round((completed / subtasks.length) * 100);
  }

  getTaskProgressSegments(task: Task): { status: TaskStatus; percentage: number; color: string }[] {
    const subtasks = this.getSubtasksForTask(task.id);
    const total = subtasks.length;

    if (total === 0) {
      const taskStatus = task.status || TaskStatus.PENDING;
      let color = "bg-gray-400";
      switch (taskStatus) {
        case TaskStatus.COMPLETED:
          color = "bg-green-500";
          break;
        case TaskStatus.SKIPPED:
          color = "bg-orange-500";
          break;
        case TaskStatus.FAILED:
          color = "bg-red-500";
          break;
        case TaskStatus.PENDING:
        default:
          color = "bg-gray-400";
          break;
      }
      return [{ status: taskStatus, percentage: 100, color }];
    }

    const completed = subtasks.filter((s) => s.status === TaskStatus.COMPLETED).length;
    const skipped = subtasks.filter((s) => s.status === TaskStatus.SKIPPED).length;
    const failed = subtasks.filter((s) => s.status === TaskStatus.FAILED).length;
    const pending = subtasks.filter((s) => s.status === TaskStatus.PENDING).length;

    const segments = [];
    if (completed > 0) {
      segments.push({
        status: TaskStatus.COMPLETED,
        percentage: Math.round((completed / total) * 100),
        color: "bg-green-500",
      });
    }
    if (skipped > 0) {
      segments.push({
        status: TaskStatus.SKIPPED,
        percentage: Math.round((skipped / total) * 100),
        color: "bg-orange-500",
      });
    }
    if (failed > 0) {
      segments.push({
        status: TaskStatus.FAILED,
        percentage: Math.round((failed / total) * 100),
        color: "bg-red-500",
      });
    }
    if (pending > 0) {
      segments.push({
        status: TaskStatus.PENDING,
        percentage: Math.round((pending / total) * 100),
        color: "bg-gray-400",
      });
    }

    return segments;
  }

  onTaskDrop(event: CdkDragDrop<Task[]>, targetStatus: TaskStatus): void {
    if (this.isUpdatingOrder()) {
      this.notifyService.showWarning("Please wait for previous operation to complete");
      return;
    }

    const task = event.item.data as Task;

    if (event.previousContainer === event.container) {
      // Reordering within the same column - just visual reordering
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      // Moving to a different column
      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex
      );

      // Update the task status in backend
      this.moveTask(task.id, targetStatus);
    }
  }
}
