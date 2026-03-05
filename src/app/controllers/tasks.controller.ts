/* sys lib */
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus, RepeatInterval } from "@models/task.model";

/* services */
import { NotifyService } from "@services/notify.service";
import { BulkActionService } from "@services/bulk-action.service";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

/**
 * TasksController - Business logic for TasksView
 * Handles all task operations, filtering, and bulk actions
 */
@Injectable()
export class TasksController {
  constructor(
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
        "task",
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
   * Toggle task completion
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

    const updatedTask = { ...task, status: newStatus };

    this.dataSyncProvider
      .update<Task>(
        "task",
        task.id,
        updatedTask,
        { isOwner: this.isOwner, isPrivate: this.isPrivate },
        task.todoId
      )
      .subscribe({
        next: () => {
          task.status = newStatus;
          if (
            newStatus === TaskStatus.COMPLETED &&
            task.repeat &&
            task.repeat !== RepeatInterval.NONE
          ) {
            this.generateNextRecurringTask(task);
          }
          this.notifyService.showSuccess(message);
        },
        error: (err) => {
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
   * Update task inline
   */
  updateTaskInline(task: Task, field: string, value: string): void {
    const updatedTask: Partial<Task> = {
      [field]: field === "status" ? (value as TaskStatus) : value,
    };

    this.dataSyncProvider
      .update<Task>(
        "task",
        task.id,
        { ...task, ...updatedTask },
        { isOwner: this.isOwner, isPrivate: this.isPrivate },
        task.todoId
      )
      .subscribe({
        next: () => {
          if (field === "status") {
            task.status = value as TaskStatus;
          } else {
            (task as any)[field] = value;
          }
          this.notifyService.showSuccess("Task updated successfully");
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to update task");
        },
      });
  }

  /**
   * Delete task
   */
  deleteTask(taskId: string, onSuccess: () => void): void {
    if (!this.todo) return;

    this.dataSyncProvider
      .delete("task", taskId, { isOwner: this.isOwner, isPrivate: this.isPrivate }, this.todo.id)
      .subscribe({
        next: () => {
          this.notifyService.showSuccess("Task deleted successfully");
          onSuccess();
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to delete task");
        },
      });
  }

  /**
   * Update task order
   */
  updateTaskOrder(tasks: Task[], onComplete: () => void): void {
    if (!this.todo) return;

    const updatedTasks = tasks.map((task, index) => ({
      ...task,
      order: tasks.length - 1 - index,
    }));

    let completedCount = 0;

    updatedTasks.forEach((task) => {
      this.dataSyncProvider
        .update<Task>(
          "task",
          task.id,
          { order: task.order },
          { isOwner: this.isOwner, isPrivate: this.isPrivate },
          this.todo!.id
        )
        .subscribe({
          next: () => {
            completedCount++;
            if (completedCount === updatedTasks.length) {
              this.notifyService.showSuccess("Task order updated successfully");
              onComplete();
            }
          },
          error: (err) => {
            this.notifyService.showError(err.message || "Failed to update task order");
          },
        });
    });
  }

  /**
   * Update two task order (for drag-drop swap)
   */
  updateTwoTaskOrder(task1: Task, task2: Task, onComplete: () => void): void {
    if (!this.todo) return;

    let completedCount = 0;

    [task1, task2].forEach((task) => {
      this.dataSyncProvider
        .update<Task>(
          "task",
          task.id,
          { order: task.order },
          { isOwner: this.isOwner, isPrivate: this.isPrivate },
          this.todo!.id
        )
        .subscribe({
          next: () => {
            completedCount++;
            if (completedCount === 2) {
              this.notifyService.showSuccess("Task order updated successfully");
              onComplete();
            }
          },
          error: (err) => {
            this.notifyService.showError(err.message || "Failed to update task order");
          },
        });
    });
  }

  /**
   * Bulk update priority
   */
  bulkUpdatePriority(taskIds: string[], priority: string, onComplete: () => void): void {
    if (!this.todo) return;

    const tasks = taskIds.map((id) => ({ id }));

    this.bulkActionService
      .bulkUpdateField(tasks, "priority", priority, (id, data) =>
        this.dataSyncProvider.update<Task>(
          "task",
          id,
          data,
          { isOwner: this.isOwner, isPrivate: this.isPrivate },
          this.todo!.id
        )
      )
      .subscribe((result) => {
        if (result.successCount > 0) {
          this.notifyService.showSuccess(`Updated priority for ${result.successCount} task(s)`);
        }
        if (result.errorCount > 0) {
          this.notifyService.showError(`Failed to update ${result.errorCount} task(s)`);
        }
        onComplete();
      });
  }

  /**
   * Bulk update status
   */
  bulkUpdateStatus(taskIds: string[], status: string, onComplete: () => void): void {
    if (!this.todo) return;

    const tasks = taskIds.map((id) => ({ id, status: "" }));

    this.bulkActionService
      .bulkUpdateStatus(tasks as any[], status, (id, data) =>
        this.dataSyncProvider.update<Task>(
          "task",
          id,
          data,
          { isOwner: this.isOwner, isPrivate: this.isPrivate },
          this.todo!.id
        )
      )
      .subscribe((result) => {
        if (result.successCount > 0) {
          this.notifyService.showSuccess(`Updated status for ${result.successCount} task(s)`);
        }
        if (result.errorCount > 0) {
          this.notifyService.showError(`Failed to update ${result.errorCount} task(s)`);
        }
        onComplete();
      });
  }

  /**
   * Bulk delete tasks
   */
  bulkDelete(taskIds: string[], onComplete: () => void): void {
    if (!this.todo) return;

    const tasks = taskIds.map((id) => ({ id }));

    this.bulkActionService
      .bulkDelete(tasks, (id) =>
        this.dataSyncProvider.delete(
          "task",
          id,
          { isOwner: this.isOwner, isPrivate: this.isPrivate },
          this.todo!.id
        )
      )
      .subscribe((result) => {
        if (result.successCount > 0) {
          this.notifyService.showSuccess(`Deleted ${result.successCount} task(s)`);
        }
        if (result.errorCount > 0) {
          this.notifyService.showError(`Failed to delete ${result.errorCount} task(s)`);
        }
        onComplete();
      });
  }
}
