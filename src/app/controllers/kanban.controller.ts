/* sys lib */
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";

/* services */
import { KanbanUIHelper } from "@services/kanban-ui-helper.service";
import { StorageService } from "@services/storage.service";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

/**
 * KanbanController - Business logic for KanbanView
 * Handles all Kanban operations including task management, drag-drop, and subtasks
 */
@Injectable()
export class KanbanController {
  constructor(
    private storageService: StorageService,
    private dataSyncProvider: DataSyncProvider,
    private uiHelper: KanbanUIHelper
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
    return this.dataSyncProvider.getAll<Todo>("todos", { userId: this.userId });
  }

  /**
   * Load tasks with subtasks for a specific todo
   */
  loadTasksWithSubtasks(
    todoId: string
  ): Observable<{ tasks: Task[]; subtasksMap: Map<string, Subtask[]> }> {
    return new Observable((observer) => {
      // Try to get from StorageService cache first
      const cachedTasks = this.storageService.tasks();
      const filteredTasks = cachedTasks.filter((task) => task.todoId === todoId);

      if (filteredTasks && filteredTasks.length > 0) {
        // Use cached data
        const subtasksMap = new Map<string, Subtask[]>();
        const cachedSubtasks = this.storageService.subtasks();

        filteredTasks.forEach((task) => {
          const taskSubtasks = cachedSubtasks.filter((st) => st.taskId === task.id);
          subtasksMap.set(task.id, taskSubtasks);
        });

        observer.next({ tasks: filteredTasks, subtasksMap });
        observer.complete();
      } else {
        // Fallback to backend if cache is empty
        this.dataSyncProvider.getAll<Task>("tasks", { todoId, userId: this.userId }).subscribe({
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
      }
    });
  }

  /**
   * Load subtasks for a specific task
   */
  loadSubtasksForTask(taskId: string): Observable<Subtask[]> {
    return this.dataSyncProvider.getAll<Subtask>("subtasks", { taskId });
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
    return this.dataSyncProvider
      .update<Task>(
        "tasks",
        taskId,
        { id: taskId, status: newStatus, todoId },
        { isOwner, isPrivate },
        todoId
      )
      .pipe(
        tap(() => {
          this.storageService.updateTask(taskId, { status: newStatus });
        })
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
    return this.dataSyncProvider
      .update<Subtask>("subtasks", subtask.id, updatedSubtask, { isOwner, isPrivate }, todoId)
      .pipe(
        tap(() => {
          this.storageService.updateSubtask(subtask.id, { status: newStatus });
        })
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

  // Delegate UI helper methods to KanbanUIHelper
  getCompletedSubtasksCount = this.uiHelper.getCompletedSubtasksCount;
  getTotalSubtasksCount = this.uiHelper.getTotalSubtasksCount;
  getTaskProgressPercentage = this.uiHelper.getTaskProgressPercentage;
  getTaskProgressSegments = this.uiHelper.getTaskProgressSegments;
  getColumnColorClass = this.uiHelper.getColumnColorClass;
  getAssigneeColor = this.uiHelper.getAssigneeColor;
  getInitials = this.uiHelper.getInitials;
  formatDate = this.uiHelper.formatDate;
}
