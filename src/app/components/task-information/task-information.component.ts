/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, Input, Output, EventEmitter } from "@angular/core";
import { Router, RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Task } from "@models/task";
import { Subtask } from "@models/subtask";
import { Response, ResponseStatus } from "@models/response";

/* services */
import { MainService } from "@services/main.service";
import { NotifyService } from "@services/notify.service";

/* components */
import { CircleProgressComponent } from "@components/circle-progress/circle-progress.component";

@Component({
  selector: "app-task-information",
  standalone: true,
  imports: [CommonModule, MatIconModule, RouterModule, CircleProgressComponent],
  templateUrl: "./task-information.component.html",
})
export class TaskInformationComponent {
  public showActions = false;

  constructor(
    private mainService: MainService,
    private notifyService: NotifyService,
    private router: Router
  ) {}

  @Input() task!: Task;
  @Input() todoId!: string;
  @Input() projectTitle!: string;
  @Input() listSubtasks: Array<Subtask> = [];

  getCompletedSubtasksCount(): number {
    return this.listSubtasks.filter((subtask) => subtask.isCompleted).length;
  }

  getInProgressSubtasksCount(): number {
    return this.listSubtasks.filter((subtask) => !subtask.isCompleted).length;
  }

  getTaskProgress(): number {
    if (this.listSubtasks.length === 0) return 0;
    const completedSubtasks = this.getCompletedSubtasksCount();
    return Math.round((completedSubtasks / this.listSubtasks.length) * 100);
  }

  toggleActions() {
    this.showActions = !this.showActions;
  }

  markTaskComplete() {
    if (this.task) {
      const updatedTask = { ...this.task, isCompleted: true };
      this.mainService
        .update<string, Task>("task", this.task.id, updatedTask)
        .then((response: Response<string>) => {
          if (response.status === ResponseStatus.SUCCESS) {
            this.task.isCompleted = true;
            this.notifyService.showSuccess("Task marked as complete!");
          } else {
            this.notifyService.showError(response.message);
          }
        })
        .catch((err: Response<string>) => {
          this.notifyService.showError(err.message);
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
    this.mainService
      .delete<string>("task", this.task?.id ?? "")
      .then((response: Response<string>) => {
        this.notifyService.showNotify(response.status, response.message);
        if (response.status === ResponseStatus.SUCCESS) {
          this.router.navigate(["/todos", this.todoId, "tasks"]);
        }
      })
      .catch((err: Response<string>) => this.notifyService.showError(err.message));
  }

  get percentCompletedSubTasks(): number {
    const listSubtasks = this.task?.subtasks ?? [];
    const listCompletedSubtasks = listSubtasks.filter((subtask: Subtask) => subtask.isCompleted);
    const percent =
      listCompletedSubtasks.length / (listSubtasks.length == 0 ? 1 : listSubtasks.length);
    return percent;
  }
}
