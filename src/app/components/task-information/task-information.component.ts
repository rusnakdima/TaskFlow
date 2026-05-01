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
import { NotifyService } from "@services/notifications/notify.service";

/* providers */
import { ApiProvider } from "@providers/api.provider";

/* components */
import { ProgressBarComponent } from "@components/progress-bar/progress-bar.component";

/* helpers */
import { DateHelper } from "@helpers/date.helper";

@Component({
  selector: "app-task-information",
  standalone: true,
  providers: [ApiProvider],
  imports: [CommonModule, MatIconModule, RouterModule, ProgressBarComponent],
  templateUrl: "./task-information.component.html",
})
export class TaskInformationComponent {
  private notifyService = inject(NotifyService);
  private router = inject(Router);
  private dataSyncProvider = inject(ApiProvider);

  public showActions = signal(false);

  protected formatDate = DateHelper.formatDateShort;

  @Input() task!: Task;
  @Input() todo_id!: string;
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
        .crud<Task>("update", "tasks", {
          id: this.task.id,
          data: updatedTask,
          parentTodoId: this.todo_id,
          visibility: this.isPrivate ? "private" : "team",
        })
        .subscribe({
          next: (result: Task) => {
            this.task.status = TaskStatus.COMPLETED;
            this.notifyService.showSuccess("Task marked as complete!");
          },
          error: (err: any) => {
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
      .crud("delete", "tasks", {
        id: this.task?.id ?? "",
        parentTodoId: this.todo_id,
        visibility: this.isPrivate ? "private" : "team",
      })
      .subscribe({
        next: (result: any) => {
          this.notifyService.showSuccess("Task deleted successfully");
          this.router.navigate(["/todos", this.todo_id, "tasks"]);
        },
        error: (err: any) => {
          this.notifyService.showError(err.message || "Failed to delete task");
        },
      });
  }
}
