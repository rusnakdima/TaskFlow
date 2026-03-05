/* sys lib */
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Response, ResponseStatus } from "@models/response.model";

/* services */
import { NotifyService } from "@services/notify.service";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

/**
 * KanbanController - Business logic for KanbanView
 * Handles all Kanban operations including task management, drag-drop, and subtasks
 */
@Injectable()
export class KanbanController {
  constructor(
    private dataSyncProvider: DataSyncProvider,
    private notifyService: NotifyService
  ) {}

  userId: string = "";

  /**
   * Initialize controller with user ID
   */
  init(userId: string): void {
    this.userId = userId;
  }

  /**
   * Load all todos for user
   */
  loadTodos(): Observable<Todo[]> {
    return this.dataSyncProvider.getAll<Todo>("todo", { userId: this.userId });
  }

  /**
   * Load tasks with subtasks for a specific todo
   */
  loadTasksWithSubtasks(
    todoId: string
  ): Observable<{ tasks: Task[]; subtasksMap: Map<string, Subtask[]> }> {
    return new Observable((observer) => {
      this.dataSyncProvider.getAll<Task>("task", { todoId, userId: this.userId }).subscribe({
        next: (tasks) => {
          // Load subtasks for each task
          const subtasksMap = new Map<string, Subtask[]>();
          let loadedCount = 0;

          tasks.forEach((task) => {
            this.loadSubtasksForTask(task.id).subscribe({
              next: (subtasks) => {
                subtasksMap.set(task.id, subtasks);
                loadedCount++;
                if (loadedCount === tasks.length) {
                  observer.next({ tasks, subtasksMap });
                  observer.complete();
                }
              },
              error: (error) => {
                console.error("Failed to load subtasks for task:", task.id);
                loadedCount++;
                if (loadedCount === tasks.length) {
                  observer.next({ tasks, subtasksMap });
                  observer.complete();
                }
              },
            });
          });

          if (tasks.length === 0) {
            observer.next({ tasks, subtasksMap });
            observer.complete();
          }
        },
        error: (error) => {
          observer.error(error);
        },
      });
    });
  }

  /**
   * Load subtasks for a specific task
   */
  loadSubtasksForTask(taskId: string): Observable<Subtask[]> {
    return this.dataSyncProvider.getAll<Subtask>("subtask", { taskId });
  }

  /**
   * Move task to different status
   */
  moveTask(
    taskId: string,
    newStatus: TaskStatus,
    todoId: string,
    isOwner: boolean,
    isPrivate: boolean
  ): Observable<Task> {
    return this.dataSyncProvider.update<Task>(
      "task",
      taskId,
      { status: newStatus, todoId },
      { isOwner, isPrivate },
      todoId
    );
  }

  /**
   * Update subtask status
   */
  updateSubtaskStatus(
    subtask: Subtask,
    newStatus: TaskStatus,
    todoId: string,
    isOwner: boolean,
    isPrivate: boolean
  ): Observable<Subtask> {
    const updatedSubtask = { ...subtask, status: newStatus };
    return this.dataSyncProvider.update<Subtask>(
      "subtask",
      subtask.id,
      updatedSubtask,
      { isOwner, isPrivate },
      todoId
    );
  }

  /**
   * Get tasks filtered by status and search query
   */
  getTasksByStatus(tasks: Task[], status: string, searchQuery: string): Task[] {
    const query = searchQuery.toLowerCase().trim();
    return tasks.filter((t) => {
      const matchesStatus = t.status === status;
      const matchesSearch =
        !query ||
        t.title.toLowerCase().includes(query) ||
        (t.description && t.description.toLowerCase().includes(query));
      return matchesStatus && matchesSearch;
    });
  }

  /**
   * Get subtasks for a task from map
   */
  getSubtasksForTask(subtasksMap: Map<string, Subtask[]>, taskId: string): Subtask[] {
    return subtasksMap.get(taskId) || [];
  }

  /**
   * Get completed subtasks count
   */
  getCompletedSubtasksCount(subtasks: Subtask[]): number {
    return subtasks.filter(
      (s) => s.status === TaskStatus.COMPLETED || s.status === TaskStatus.SKIPPED
    ).length;
  }

  /**
   * Get total subtasks count
   */
  getTotalSubtasksCount(subtasks: Subtask[]): number {
    return subtasks.length;
  }

  /**
   * Get task progress percentage
   */
  getTaskProgressPercentage(task: Task, subtasks: Subtask[]): number {
    if (subtasks.length === 0) {
      return task.status === TaskStatus.COMPLETED || task.status === TaskStatus.SKIPPED ? 100 : 0;
    }
    const completed = this.getCompletedSubtasksCount(subtasks);
    return Math.round((completed / subtasks.length) * 100);
  }

  /**
   * Get task progress segments for visual bar
   */
  getTaskProgressSegments(
    task: Task,
    subtasks: Subtask[]
  ): { status: TaskStatus; percentage: number; color: string }[] {
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

  /**
   * Get column color class based on status
   */
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

  /**
   * Get assignee color based on name hash
   */
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

  /**
   * Get initials from name
   */
  getInitials(name: string): string {
    if (!name) return "?";
    return name.substring(0, 1).toUpperCase();
  }

  /**
   * Format date for display
   */
  formatDate(dateString: string): string {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }
}
