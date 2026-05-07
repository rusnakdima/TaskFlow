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
import { Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";

/* services */
import { NotifyService } from "@services/notifications/notify.service";

/* providers */
import { ApiProvider } from "@providers/api.provider";

/* components */
import {
  ItemInfoBaseComponent,
  ItemInfoColorScheme,
} from "@components/item-info-base/item-info-base.component";
import { ProgressBarComponent } from "@components/progress-bar/progress-bar.component";

/* constants */
import { ActionColors } from "@constants/table-field.constants";

@Component({
  selector: "app-task-information",
  standalone: true,
  providers: [ApiProvider],
  imports: [CommonModule, MatIconModule, RouterModule, ProgressBarComponent],
  templateUrl: "./task-information.component.html",
})
export class TaskInformationComponent extends ItemInfoBaseComponent implements OnChanges {
  private notifyService = inject(NotifyService);
  private router = inject(Router);
  private dataSyncProvider = inject(ApiProvider);

  public showActions = signal(false);

  @Input() task!: Task;
  @Input() todo_id!: string;
  @Input() projectTitle!: string;
  @Input() listSubtasks: Array<Subtask> = [];

  @Input() override isOwner: boolean = true;
  @Input() override isPrivate: boolean = true;

  completedCount = computed(
    () => this.listSubtasks.filter((s) => s.status === TaskStatus.COMPLETED).length
  );
  skippedCount = computed(
    () => this.listSubtasks.filter((s) => s.status === TaskStatus.SKIPPED).length
  );
  failedCount = computed(
    () => this.listSubtasks.filter((s) => s.status === TaskStatus.FAILED).length
  );
  inProgressCount = computed(
    () => this.listSubtasks.filter((s) => s.status === TaskStatus.PENDING).length
  );

  constructor() {
    super();
    this.colorScheme.set(ItemInfoColorScheme.GREEN);
  }

  ngOnChanges(changes: SimpleChanges): void {
    // stats are now computed signals
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
          visibility: this.isPrivate ? "private" : "shared",
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
        visibility: this.isPrivate ? "private" : "shared",
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

  getActionColor(action: string): string {
    const colorKey = action as keyof typeof ActionColors;
    return ActionColors[colorKey] || ActionColors.default;
  }
}
