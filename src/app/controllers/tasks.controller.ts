/* sys lib */
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus, RepeatInterval, PriorityTask } from "@models/task.model";

/* services */
import { NotifyService } from "@services/notify.service";
import { BulkActionService } from "@services/bulk-action.service";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

/* services */
import { StorageService } from "@services/storage.service";

/**
 * TasksController - Business logic for TasksView
 * Handles all task operations, filtering, and bulk actions
 */
@Injectable()
export class TasksController {
  constructor(
    private storageService: StorageService,
    private dataSyncProvider: DataSyncProvider,
    private notifyService: NotifyService,
    private bulkActionService: BulkActionService
  ) {}

  todo: Todo | null = null;
  isOwner: boolean = true;
  isPrivate: boolean = true;
  userId: string = "";

  /**
   * Initialize controller with todo data
   */
  init(todo: Todo, userId: string): void {
    this.todo = todo;
    this.userId = userId;
    this.isOwner = todo.userId === userId;
    this.isPrivate = todo.visibility === "private";
  }

  /**
   * Get tasks by todo ID
   */
  getTasksByTodoId(todoId: string): Observable<Task[]> {
    return this.dataSyncProvider
      .getAll<Task>(
        "tasks",
        { todoId },
        { isOwner: this.isOwner, isPrivate: this.isPrivate },
        todoId
      )
      .pipe(
        map((tasks) => {
          if (!Array.isArray(tasks)) {
            return [];
          }
          return tasks.sort((a, b) => b.order - a.order);
        })
      );
  }

  /**
   * Toggle task completion - Optimistic update with rollback on failure
   */
  toggleTaskCompletion(task: Task): void {
    let newStatus: TaskStatus;
    let message = "";

    if (
      task.status === TaskStatus.PENDING &&
      !this.checkDependenciesCompleted(task.dependsOn || [])
    ) {
      this.notifyService.showError("Cannot complete task: waiting for dependencies");
      return;
    }

    switch (task.status) {
      case TaskStatus.PENDING:
        newStatus = TaskStatus.COMPLETED;
        message = "Task completed";
        break;
      case TaskStatus.COMPLETED:
        newStatus = TaskStatus.SKIPPED;
        message = "Task skipped";
        break;
      case TaskStatus.SKIPPED:
        newStatus = TaskStatus.FAILED;
        message = "Task marked as failed";
        break;
      case TaskStatus.FAILED:
      default:
        newStatus = TaskStatus.PENDING;
        message = "Task reopened";
        break;
    }

    // Store previous state for rollback
    const previousStatus = task.status;

    // Optimistic update: update cache immediately
    task.status = newStatus;
    this.storageService.updateTask(task.id, { status: newStatus });
    this.notifyService.showSuccess(message);

    const updatedTask = { ...task, status: newStatus };

    this.dataSyncProvider
      .update<Task>(
        "tasks",
        task.id,
        updatedTask,
        { isOwner: this.isOwner, isPrivate: this.isPrivate },
        task.todoId
      )
      .subscribe({
        next: () => {
          // Success - cache already updated
          if (
            newStatus === TaskStatus.COMPLETED &&
            task.repeat &&
            task.repeat !== RepeatInterval.NONE
          ) {
            this.generateNextRecurringTask(task);
          }
        },
        error: (err) => {
          // Rollback on failure
          task.status = previousStatus;
          this.storageService.updateTask(task.id, { status: previousStatus });
          this.notifyService.showError(err.message || "Failed to update task status");
        },
      });
  }

  /**
   * Check if dependencies are completed
   */
  checkDependenciesCompleted(dependsOn: string[]): boolean {
    if (!dependsOn || dependsOn.length === 0) return true;

    const tasks = this.todo?.tasks || [];
    return dependsOn.every((depId) => {
      const depTask = tasks.find((t) => t.id === depId);
      return (
        depTask &&
        (depTask.status === TaskStatus.COMPLETED || depTask.status === TaskStatus.SKIPPED)
      );
    });
  }

  /**
   * Generate next recurring task
   */
  generateNextRecurringTask(task: Task): void {
    const nextTask = { ...task };
    delete (nextTask as any)._id;
    nextTask.id = "";
    nextTask.status = TaskStatus.PENDING;
    nextTask.createdAt = new Date().toISOString().split(".")[0];
    nextTask.updatedAt = nextTask.createdAt;

    if (task.startDate) {
      const nextStart = new Date(task.startDate);
      const nextEnd = task.endDate ? new Date(task.endDate) : null;

      switch (task.repeat) {
        case RepeatInterval.DAILY:
          nextStart.setDate(nextStart.getDate() + 1);
          if (nextEnd) nextEnd.setDate(nextEnd.getDate() + 1);
          break;
        case RepeatInterval.WEEKLY:
          nextStart.setDate(nextStart.getDate() + 7);
          if (nextEnd) nextEnd.setDate(nextEnd.getDate() + 7);
          break;
        case RepeatInterval.MONTHLY:
          nextStart.setMonth(nextStart.getMonth() + 1);
          if (nextEnd) nextEnd.setMonth(nextEnd.getMonth() + 1);
          break;
      }

      nextTask.startDate = nextStart.toISOString().split(".")[0] + "Z";
      if (nextEnd) {
        nextTask.endDate = nextEnd.toISOString().split(".")[0] + "Z";
      }
    }

    this.dataSyncProvider
      .create<Task>(
        "task",
        nextTask,
        { isOwner: this.isOwner, isPrivate: this.isPrivate },
        task.todoId
      )
      .subscribe({
        next: () => {
          this.notifyService.showInfo(`Next recurring task created: ${task.title}`);
        },
        error: () => {
          this.notifyService.showError("Failed to create next recurring task");
        },
      });
  }

  /**
   * Update task inline - Optimistic update with rollback on failure
   */
  updateTaskInline(task: Task, field: string, value: string): void {
    // Store previous state for rollback
    const previousValue = (task as any)[field];
    const previousTask = { ...task };

    // Optimistic update: update cache immediately
    if (field === "status") {
      task.status = value as TaskStatus;
      this.storageService.updateTask(task.id, { status: value as TaskStatus });
    } else {
      (task as any)[field] = value;
      this.storageService.updateTask(task.id, { [field]: value });
    }
    this.notifyService.showSuccess("Task updated successfully");

    const updatedTask: Partial<Task> = {
      [field]: field === "status" ? (value as TaskStatus) : value,
    };

    this.dataSyncProvider
      .update<Task>(
        "tasks",
        task.id,
        { ...task, ...updatedTask },
        { isOwner: this.isOwner, isPrivate: this.isPrivate },
        task.todoId
      )
      .subscribe({
        next: () => {
          // Success - cache already updated
        },
        error: (err) => {
          // Rollback on failure
          (task as any)[field] = previousValue;
          this.storageService.updateTask(task.id, { [field]: previousValue });
          this.notifyService.showError(err.message || "Failed to update task");
        },
      });
  }

  /**
   * Delete task - Optimistic update with rollback on failure
   */
  deleteTask(taskId: string, onSuccess: () => void): void {
    if (!this.todo) return;

    // Get the task before deleting for potential rollback
    const taskToDelete = this.storageService.getTaskById(taskId);

    // Optimistic update: remove from cache immediately
    this.storageService.removeTask(taskId);
    this.notifyService.showSuccess("Task deleted successfully");
    onSuccess();

    this.dataSyncProvider
      .delete("tasks", taskId, { isOwner: this.isOwner, isPrivate: this.isPrivate }, this.todo.id)
      .subscribe({
        next: () => {
          // Success - cache already updated
        },
        error: (err) => {
          // Rollback on failure
          if (taskToDelete) {
            this.storageService.rollbackRemoveTask(taskToDelete);
          }
          this.notifyService.showError(err.message || "Failed to delete task");
        },
      });
  }

  /**
   * Update task order - Optimistic update with rollback on failure
   */
  updateTaskOrder(tasks: Task[], onComplete: () => void): void {
    if (!this.todo) return;

    // Store previous state for rollback
    const previousOrders = tasks.map((task) => ({ id: task.id, order: task.order }));

    const updatedTasks = tasks.map((task, index) => ({
      ...task,
      order: tasks.length - 1 - index,
    }));

    // Optimistic update: update cache immediately
    updatedTasks.forEach((task) => {
      this.storageService.updateTask(task.id, { order: task.order });
    });
    this.notifyService.showSuccess("Task order updated successfully");
    onComplete();

    let completedCount = 0;

    updatedTasks.forEach((task) => {
      this.dataSyncProvider
        .update<Task>(
          "tasks",
          task.id,
          { order: task.order },
          { isOwner: this.isOwner, isPrivate: this.isPrivate },
          this.todo!.id
        )
        .subscribe({
          next: () => {
            completedCount++;
          },
          error: (err) => {
            // Rollback on failure
            previousOrders.forEach((prev) => {
              this.storageService.updateTask(prev.id, { order: prev.order });
            });
            this.notifyService.showError(err.message || "Failed to update task order");
          },
        });
    });
  }

  /**
   * Update two task order (for drag-drop swap) - Optimistic update with rollback on failure
   */
  updateTwoTaskOrder(task1: Task, task2: Task, onComplete: () => void): void {
    if (!this.todo) return;

    // Store previous state for rollback
    const previousTask1Order = task1.order;
    const previousTask2Order = task2.order;

    const now = new Date().toISOString();
    // Optimistic update: update cache immediately
    this.storageService.updateTask(task1.id, { order: task1.order });
    this.storageService.updateTask(task2.id, { order: task2.order });
    this.notifyService.showSuccess("Task order updated successfully");

    let completedCount = 0;
    let hasError = false;

    const checkComplete = () => {
      completedCount++;
      if (completedCount === 2 || hasError) {
        onComplete();
      }
    };

    [task1, task2].forEach((task) => {
      this.dataSyncProvider
        .update<Task>(
          "tasks",
          task.id,
          { id: task.id, order: task.order, updatedAt: now },
          { isOwner: this.isOwner, isPrivate: this.isPrivate },
          this.todo!.id
        )
        .subscribe({
          next: () => {
            checkComplete();
          },
          error: (err) => {
            hasError = true;
            // Rollback on failure
            this.storageService.updateTask(task1.id, { order: previousTask1Order });
            this.storageService.updateTask(task2.id, { order: previousTask2Order });
            this.notifyService.showError(err.message || "Failed to update task order");
            checkComplete();
          },
        });
    });
  }

  /**
   * Bulk update priority - Optimistic update with rollback on failure
   */
  bulkUpdatePriority(taskIds: string[], priority: string, onComplete: () => void): void {
    if (!this.todo) return;

    // Store previous state for rollback
    const previousStates = taskIds.map((id) => {
      const task = this.storageService.getTaskById(id);
      return { id, previousPriority: task?.priority || PriorityTask.MEDIUM };
    });

    const tasks = taskIds.map((id) => ({ id }));

    // Optimistic update: update cache immediately
    taskIds.forEach((id) => {
      this.storageService.updateTask(id, { priority: priority as PriorityTask });
    });
    this.notifyService.showSuccess(`Updated priority for ${taskIds.length} task(s)`);
    onComplete();

    this.bulkActionService
      .bulkUpdateField(tasks, "priority", priority, (id, data) =>
        this.dataSyncProvider.update<Task>(
          "tasks",
          id,
          data,
          { isOwner: this.isOwner, isPrivate: this.isPrivate },
          this.todo!.id
        )
      )
      .subscribe((result) => {
        if (result.successCount > 0) {
          // Cache already updated
        }
        if (result.errorCount > 0) {
          // Rollback failed updates
          previousStates.forEach((prev) => {
            this.storageService.updateTask(prev.id, { priority: prev.previousPriority });
          });
          this.notifyService.showError(`Failed to update ${result.errorCount} task(s)`);
        }
      });
  }

  /**
   * Bulk update status - Optimistic update with rollback on failure
   */
  bulkUpdateStatus(taskIds: string[], status: string, onComplete: () => void): void {
    if (!this.todo) return;

    // Store previous state for rollback
    const previousStates = taskIds.map((id) => {
      const task = this.storageService.getTaskById(id);
      return { id, previousStatus: task?.status || TaskStatus.PENDING };
    });

    const tasks = taskIds.map((id) => ({ id, status: "" }));

    // Optimistic update: update cache immediately
    taskIds.forEach((id) => {
      this.storageService.updateTask(id, { status: status as TaskStatus });
    });
    this.notifyService.showSuccess(`Updated status for ${taskIds.length} task(s)`);
    onComplete();

    this.bulkActionService
      .bulkUpdateStatus(tasks as any[], status, (id, data) =>
        this.dataSyncProvider.update<Task>(
          "tasks",
          id,
          data,
          { isOwner: this.isOwner, isPrivate: this.isPrivate },
          this.todo!.id
        )
      )
      .subscribe((result) => {
        if (result.successCount > 0) {
          // Cache already updated
        }
        if (result.errorCount > 0) {
          // Rollback failed updates
          previousStates.forEach((prev) => {
            this.storageService.updateTask(prev.id, { status: prev.previousStatus });
          });
          this.notifyService.showError(`Failed to update ${result.errorCount} task(s)`);
        }
      });
  }

  /**
   * Bulk delete tasks - Optimistic update with rollback on failure
   */
  bulkDelete(taskIds: string[], onComplete: () => void): void {
    if (!this.todo) return;

    // Store previous state for rollback
    const tasksToDelete = taskIds
      .map((id) => this.storageService.getTaskById(id))
      .filter(Boolean) as Task[];

    const tasks = taskIds.map((id) => ({ id }));

    // Optimistic update: remove from cache immediately
    taskIds.forEach((id) => {
      this.storageService.removeTask(id);
    });
    this.notifyService.showSuccess(`Deleted ${taskIds.length} task(s)`);
    onComplete();

    this.bulkActionService
      .bulkDelete(tasks, (id) =>
        this.dataSyncProvider.delete(
          "tasks",
          id,
          { isOwner: this.isOwner, isPrivate: this.isPrivate },
          this.todo!.id
        )
      )
      .subscribe((result) => {
        if (result.successCount > 0) {
          // Cache already updated
        }
        if (result.errorCount > 0) {
          // Rollback failed deletions
          tasksToDelete.forEach((task) => {
            if (task) {
              this.storageService.rollbackRemoveTask(task);
            }
          });
          this.notifyService.showError(`Failed to delete ${result.errorCount} task(s)`);
        }
      });
  }
}
