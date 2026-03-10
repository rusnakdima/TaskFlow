/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, Input, signal, inject } from "@angular/core";
import { Router, RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";

/* services */
import { NotifyService } from "@services/notify.service";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

/* components */
import { ProgressBarComponent } from "@components/progress-bar/progress-bar.component";

/* helpers */
import { BaseItemHelper } from "@helpers/base-item.helper";

@Component({
  selector: "app-task-information",
  standalone: true,
  providers: [DataSyncProvider],
  imports: [CommonModule, MatIconModule, RouterModule, ProgressBarComponent],
  templateUrl: "./task-information.component.html",
})
export class TaskInformationComponent {
  private notifyService = inject(NotifyService);
  private router = inject(Router);
  private dataSyncProvider = inject(DataSyncProvider);
  private baseHelper = inject(BaseItemHelper);

  public showActions = signal(false);

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

  toggleActions() {
    this.showActions.set(!this.showActions());
  }

  markTaskComplete() {
    if (this.task) {
      const updatedTask = { ...this.task, status: TaskStatus.COMPLETED };
      this.dataSyncProvider
        .update<Task>(
          "tasks",
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
        "tasks",
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
}
