/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";
import { Router, RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";
import { Response, ResponseStatus } from "@models/response.model";

/* services */
import { MainService } from "@services/main.service";
import { NotifyService } from "@services/notify.service";

/* components */
import { CircleProgressComponent } from "@components/circle-progress/circle-progress.component";

@Component({
  selector: "app-todo-information",
  standalone: true,
  imports: [CommonModule, MatIconModule, RouterModule, CircleProgressComponent],
  templateUrl: "./todo-information.component.html",
})
export class TodoInformationComponent {
  public showActions = false;

  constructor(
    private mainService: MainService,
    private notifyService: NotifyService,
    private router: Router
  ) {}

  @Input() todo!: Todo;

  get listTasks(): Array<Task> {
    return this.todo?.tasks ?? [];
  }

  getCompletedTasksCount(): number {
    return this.listTasks.filter((task) => task.status === TaskStatus.COMPLETED).length;
  }

  getSkippedTasksCount(): number {
    return this.listTasks.filter((task) => task.status === TaskStatus.SKIPPED).length;
  }

  getFailedTasksCount(): number {
    return this.listTasks.filter((task) => task.status === TaskStatus.FAILED).length;
  }

  getInProgressTasksCount(): number {
    return this.listTasks.filter((task) => task.status === TaskStatus.PENDING).length;
  }

  getProjectProgress(): number {
    if (this.listTasks.length === 0) return 0;
    const completedTasks = this.getCompletedTasksCount() + this.getSkippedTasksCount();
    return Math.round((completedTasks / this.listTasks.length) * 100);
  }

  toggleActions() {
    this.showActions = !this.showActions;
  }

  shareProject() {
    this.notifyService.showInfo("Project sharing functionality would be implemented here");
  }

  confirmDeleteTodo() {
    if (
      confirm(
        `Are you sure you want to delete the project "${this.todo?.title}"? This will also delete all associated tasks.`
      )
    ) {
      this.deleteTodo();
    }
  }

  deleteTodo() {
    this.mainService
      .delete<string>("todo", this.todo?.id ?? "")
      .then((response: Response<string>) => {
        this.notifyService.showNotify(response.status, response.message);
        if (response.status === ResponseStatus.SUCCESS) {
          this.router.navigate(["/", "todos"]);
        }
      })
      .catch((err: Response<string>) => this.notifyService.showError(err.message));
  }
}
