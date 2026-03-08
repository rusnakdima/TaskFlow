/* sys lib */
import { CommonModule } from "@angular/common";
import {
  Component,
  EventEmitter,
  Input,
  Output,
  signal,
  inject,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  computed,
} from "@angular/core";
import { RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { DragDropModule } from "@angular/cdk/drag-drop";

/* helpers */
import { Common } from "@helpers/common.helper";
import { BaseItemHelper } from "@helpers/base-item.helper";

/* services */
import { AuthService } from "@services/auth.service";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";

@Component({
  selector: "app-todo",
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, DragDropModule],
  templateUrl: "./todo.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TodoComponent {
  private baseHelper = inject(BaseItemHelper);
  private authService = inject(AuthService);

  constructor(private cdr: ChangeDetectorRef) {}

  @Input() todo: Todo | null = null;
  @Input() index: number = 0;
  @Input() isOwner: boolean = true;
  @Input() isPrivate: boolean = true;
  @Output() deleteEvent: EventEmitter<string> = new EventEmitter<string>();
  @Output() saveAsBlueprintEvent: EventEmitter<Todo> = new EventEmitter<Todo>();

  isExpandedDetails = signal(false);

  truncateString = Common.truncateString;

  get unreadCommentsCount(): number {
    if (!this.todo) return 0;
    const userId = this.authService.getValueByKey("id");
    if (!userId) return 0;

    let count = 0;
    const tasks = this.todo.tasks || [];

    tasks.forEach((task) => {
      // Comments in tasks
      if (task.comments) {
        count += task.comments.filter((c) => !c.readBy || !c.readBy.includes(userId)).length;
      }
      // Comments in subtasks
      if (task.subtasks) {
        task.subtasks.forEach((subtask) => {
          if (subtask.comments) {
            count += subtask.comments.filter((c) => !c.readBy || !c.readBy.includes(userId)).length;
          }
        });
      }
    });

    return count;
  }

  onSaveAsBlueprint(event: Event) {
    event.stopPropagation();
    if (this.todo) {
      this.saveAsBlueprintEvent.emit(this.todo);
      this.cdr.markForCheck();
    }
  }

  get countCompletedTasks(): number {
    return this.baseHelper.countCompleted(this.todo?.tasks ?? []);
  }

  get countTasks(): number {
    return this.todo?.tasks?.length ?? 0;
  }

  get percentCompletedTasks(): number {
    const completed = this.baseHelper.countCompleted(this.todo?.tasks ?? []);
    const total = this.todo?.tasks?.length ?? 0;
    return completed / (total === 0 ? 1 : total);
  }

  toggleDetails(event: Event) {
    event.stopPropagation();
    this.isExpandedDetails.set(!this.isExpandedDetails());
    this.cdr.markForCheck();
  }

  getProgressPercentage(): number {
    return Math.round(this.percentCompletedTasks * 100);
  }

  getProgressSegments = () => this.baseHelper.getProgressSegments(this.todo?.tasks ?? []);

  getProjectStatusColor(): string {
    if (!this.todo) return "bg-gray-400";
    const completed = this.countCompletedTasks;
    const total = this.countTasks;

    if (total === 0) return "bg-gray-400";
    if (completed === total) return "bg-green-700 dark:bg-green-400";
    return "bg-blue-700 dark:bg-blue-400";
  }

  getProjectStatusText(): string {
    if (!this.todo) return "Not Started";
    const completed = this.countCompletedTasks;
    const total = this.countTasks;
    if (total === 0) return "Not Started";
    if (completed === total) return "Completed";
    if (completed > total / 2) return "In Progress";
    return "In Progress";
  }

  formatDate = this.baseHelper.formatDate;

  getPriorityBadgeClass = this.baseHelper.getPriorityBadgeClass;

  deleteTodo() {
    if (this.todo) {
      this.deleteEvent.emit(this.todo.id);
    }
  }
}
