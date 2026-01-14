/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, Input, Output, EventEmitter, signal } from "@angular/core";
import { Router, RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";

/* services */
import { NotifyService } from "@services/notify.service";
import { DataSyncProvider } from "@services/data-sync.provider";

/* components */
import { CircleProgressComponent } from "@components/circle-progress/circle-progress.component";

@Component({
  selector: "app-task-information",
  standalone: true,
  providers: [DataSyncProvider],
  imports: [CommonModule, MatIconModule, RouterModule, CircleProgressComponent],
  templateUrl: "./task-information.component.html",
})
export class TaskInformationComponent {
  public showActions = signal(false);

  constructor(
    private notifyService: NotifyService,
    private router: Router,
    private dataSyncProvider: DataSyncProvider
  ) {}

  @Input() task!: Task;
  @Input() todoId!: string;
  @Input() projectTitle!: string;
  @Input() listSubtasks: Array<Subtask> = [];

  @Input() isOwner: boolean = true;
  @Input() isPrivate: boolean = true;

  getCompletedSubtasksCount(): number {
    return this.listSubtasks.filter((subtask) => subtask.status === TaskStatus.COMPLETED).length;
  }

  getSkippedSubtasksCount(): number {
    return this.listSubtasks.filter((subtask) => subtask.status === TaskStatus.SKIPPED).length;
  }

  getFailedSubtasksCount(): number {
    return this.listSubtasks.filter((subtask) => subtask.status === TaskStatus.FAILED).length;
  }

  getInProgressSubtasksCount(): number {
    return this.listSubtasks.filter((subtask) => subtask.status === TaskStatus.PENDING).length;
  }

  getTaskProgress(): number {
    if (this.listSubtasks.length === 0) return 0;
    const completedSubtasks = this.getCompletedSubtasksCount() + this.getSkippedSubtasksCount();
    return Math.round((completedSubtasks / this.listSubtasks.length) * 100);
  }

  toggleActions() {
    this.showActions.set(!this.showActions());
  }

  markTaskComplete() {
    if (this.task) {
      const updatedTask = { ...this.task, status: TaskStatus.COMPLETED };
      this.dataSyncProvider
        .update<Task>(
          "task",
          this.task.id,
          updatedTask,
          { isOwner: this.isOwner, isPrivate: this.isPrivate },
          this.todoId
        )
        .subscribe({
          next: (result) => {
            this.task.status = TaskStatus.COMPLETED;
            this.notifyService.showSuccess("Task marked as complete!");
          },
          error: (err) => {
            this.notifyService.showError(err.message || "Failed to update task");
          },
        });
    }
  }

  confirmDeleteTask() {
    if (
      confirm(
        `Are you sure you want to delete the task "${this.task?.title}"? This will also delete all subtasks.`
      )
    ) {
      this.deleteTask();
    }
  }

  deleteTask() {
    this.dataSyncProvider
      .delete(
        "task",
        this.task?.id ?? "",
        { isOwner: this.isOwner, isPrivate: this.isPrivate },
        this.todoId
      )
      .subscribe({
        next: (result) => {
          this.notifyService.showSuccess("Task deleted successfully");
          this.router.navigate(["/todos", this.todoId, "tasks"]);
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to delete task");
        },
      });
  }

  get percentCompletedSubTasks(): number {
    const listSubtasks = this.task?.subtasks ?? [];
    const listCompletedSubtasks = listSubtasks.filter(
      (subtask: Subtask) =>
        subtask.status === TaskStatus.COMPLETED || subtask.status === TaskStatus.SKIPPED
    );
    const percent =
      listCompletedSubtasks.length / (listSubtasks.length == 0 ? 1 : listSubtasks.length);
    return percent;
  }
}
