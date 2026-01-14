/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, Input, signal } from "@angular/core";
import { Router, RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";
import { Response, ResponseStatus } from "@models/response.model";

/* services */
import { NotifyService } from "@services/notify.service";
import { DataSyncProvider } from "@services/data-sync.provider";
import { AuthService } from "@services/auth.service";

/* components */
import { CircleProgressComponent } from "@components/circle-progress/circle-progress.component";
import { ShareDialogComponent } from "@components/share-dialog/share-dialog.component";

@Component({
  selector: "app-todo-information",
  standalone: true,
  providers: [DataSyncProvider],
  imports: [CommonModule, MatIconModule, RouterModule, CircleProgressComponent, MatDialogModule],
  templateUrl: "./todo-information.component.html",
})
export class TodoInformationComponent {
  public showActions = signal(false);

  constructor(
    private router: Router,
    private notifyService: NotifyService,
    private authService: AuthService,
    private dataSyncProvider: DataSyncProvider,
    private dialog: MatDialog
  ) {}

  @Input() todo: Todo | null = null;

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
    this.showActions.set(!this.showActions());
  }

  shareProject() {
    const dialogRef = this.dialog.open(ShareDialogComponent, {
      data: { todo: this.todo },
      width: "600px",
      maxWidth: "90vw",
      panelClass: "share-dialog-panel",
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        // Handle successful sharing update
        this.notifyService.showSuccess("Project sharing updated successfully");
      }
    });
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
    const isPrivate = this.todo?.visibility === "private";
    const isOwner = this.todo?.userId === this.authService.getValueByKey("id");
    this.dataSyncProvider.delete("todo", this.todo?.id ?? "", { isOwner, isPrivate }).subscribe({
      next: (result) => {
        this.notifyService.showSuccess("Todo deleted successfully");
        this.router.navigate(["/", "todos"]);
      },
      error: (err) => {
        this.notifyService.showError(err.message || "Failed to delete todo");
      },
    });
  }
}
