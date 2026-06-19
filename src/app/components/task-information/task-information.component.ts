/* sys lib */
import { CommonModule } from "@angular/common";
import {
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  signal,
  inject,
  computed,
} from "@angular/core";
import { Router, RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Task, TaskStatus, Subtask } from "@entities/generated/api.types";

/* services */
import { NotifyService } from "@services/notifications/notify.service";
import { ApiService } from "@services/api.service";
import { ConfirmDialogService } from "@core/services/confirm-dialog.service";

/* components */
import {
  ItemInfoBaseComponent,
  ItemInfoColorScheme,
} from "@components/item-info-base/item-info-base.component";
import { ProgressBarComponent } from "@components/progress-bar/progress-bar.component";

/* helpers */
import { getActionColor } from "@helpers/action-color.helper";
import { countByStatus } from "@helpers/array.helper";

@Component({
  selector: "app-task-information",
  standalone: true,
  imports: [CommonModule, MatIconModule, RouterModule, ProgressBarComponent],
  templateUrl: "./task-information.component.html",
})
export class TaskInformationComponent extends ItemInfoBaseComponent implements OnChanges {
  private notifyService = inject(NotifyService);
  private router = inject(Router);
  private requestService = inject(ApiService);
  private apiService = inject(ApiService);
  private confirmDialogService = inject(ConfirmDialogService);

  public showActions = signal(false);

  @Input() task!: Task;
  @Input() todo_id!: string;
  @Input() projectTitle!: string;
  @Input() listSubtasks: Array<Subtask> = [];

  @Input() override isOwner: boolean = true;
  @Input() override isPrivate: boolean = true;

  completedCount = computed(() => countByStatus(this.listSubtasks, TaskStatus.COMPLETED));
  skippedCount = computed(() => countByStatus(this.listSubtasks, TaskStatus.SKIPPED));
  failedCount = computed(() => countByStatus(this.listSubtasks, TaskStatus.FAILED));
  inProgressCount = computed(() => countByStatus(this.listSubtasks, TaskStatus.PENDING));

  constructor() {
    super();
    this.colorScheme.set(ItemInfoColorScheme.GREEN);
  }

  ngOnChanges(_changes: SimpleChanges): void {
    // stats are now computed signals
  }

  toggleActions() {
    this.showActions.set(!this.showActions());
  }

  markTaskComplete() {
    if (this.task) {
      const updatedTask = { ...this.task, status: TaskStatus.COMPLETED };
      this.requestService
        .update("tasks", this.task.id, updatedTask, {
          visibility: this.isPrivate ? "private" : "shared",
        })
        .subscribe({
          next: (_result: Task) => {
            this.task.status = TaskStatus.COMPLETED;
            this.notifyService.showSuccess("Task marked as complete!");
          },
          error: (err: any) => {
            this.notifyService.showError(err.message || "Failed to update task");
          },
        });
    }
  }

  async confirmDeleteTask() {
    const confirmed = await this.confirmDialogService.confirm({
      title: "Delete Task",
      message: `Are you sure you want to delete the task "${this.task?.title}"? This will also delete all subtasks.`,
      confirmText: "Delete",
      confirmClass: "bg-red-600 hover:bg-red-700",
    });
    if (!confirmed) return;
    this.deleteTask();
  }

  deleteTask() {
    this.apiService.tasks
      .delete(this.task?.id ?? "", { visibility: this.isPrivate ? "private" : "shared" })
      .subscribe({
        next: (_result: any) => {
          this.notifyService.showSuccess("Task deleted successfully");
          this.router.navigate(["/todos", this.todo_id, "tasks"]);
        },
        error: (err: any) => {
          this.notifyService.showError(err.message || "Failed to delete task");
        },
      });
  }

  protected override headerClass(): string {
    return "";
  }

  getActionColor(action: string): string {
    return getActionColor(action, "");
  }
}
