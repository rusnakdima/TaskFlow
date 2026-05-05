/* sys lib */
import { CommonModule } from "@angular/common";
import {
  Component,
  EventEmitter,
  Input,
  OnInit,
  OnDestroy,
  Output,
  signal,
  inject,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Subscription } from "rxjs";
import { take } from "rxjs/operators";

/* base */
import { BaseItemComponent } from "@components/base-item.component";
import { RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { DragDropModule } from "@angular/cdk/drag-drop";

/* components */
import { ProgressBarComponent } from "@components/progress-bar/progress-bar.component";
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

/* helpers */
import { Common } from "@helpers/common.helper";
import { BaseItemHelper } from "@helpers/base-item.helper";
import { DateHelper } from "@helpers/date.helper";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { NotifyService } from "@services/notifications/notify.service";
import { TemplateService } from "@services/features/template.service";
import { DataService } from "@services/data/data.service";

/* models */
import { Todo } from "@models/todo.model";
import { TaskStatus } from "@models/task.model";

@Component({
  selector: "app-todo",
  standalone: true,
  host: { style: "display: block;" },
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    DragDropModule,
    ProgressBarComponent,
    CheckboxComponent,
    FormsModule,
  ],
  templateUrl: "./todo.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TodoComponent extends BaseItemComponent implements OnInit {
  private authService = inject(AuthService);
  private notifyService = inject(NotifyService);
  private templateService = inject(TemplateService);
  private dataService = inject(DataService);

  @Input() isOwner: boolean = true;
  @Input() isPrivate: boolean = true;
  @Input() highlight: boolean = false;
  @Input() showActions: boolean = true;
  @Input() todo: Todo | null = null;
  @Input() index: number = 0;
  @Input() unreadCommentsCount: number = 0;
  @Input() isSelected: boolean = false;

  @Output() deleteTodoEvent: EventEmitter<string> = new EventEmitter();
  @Output() archiveTodoEvent: EventEmitter<string> = new EventEmitter();
  @Output() restoreTodoEvent: EventEmitter<string> = new EventEmitter();
  @Output() saveAsBlueprintEvent: EventEmitter<Todo> = new EventEmitter();
  @Output() updateTodoEvent: EventEmitter<{ field: string; value: any }> = new EventEmitter();
  @Output() selectionChangeEvent: EventEmitter<{ id: string; selected: boolean }> =
    new EventEmitter();

  isExpandedDetails = signal(false);
  isDragging = signal(false);
  totalSubtasksCount = signal(0);
  completedSubtasksCount = signal(0);
  private tasksSubscription: Subscription | null = null;
  private subtasksSubscription: Subscription | null = null;

  get menuClass(): string {
    return "todo-menu";
  }

  ngOnInit() {
    this.loadSubtasksData();
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    if (this.tasksSubscription) {
      this.tasksSubscription.unsubscribe();
    }
    if (this.subtasksSubscription) {
      this.subtasksSubscription.unsubscribe();
    }
  }

  private loadSubtasksData(): void {
    if (!this.todo?.id) return;

    this.tasksSubscription = this.dataService
      .getTasks(this.todo.id)
      .pipe(take(1))
      .subscribe((tasks) => {
        let total = 0;
        let completed = 0;

        tasks.forEach((task) => {
          this.subtasksSubscription = this.dataService
            .getSubtasks(task.id)
            .pipe(take(1))
            .subscribe((subtasks) => {
              total += subtasks.length;
              completed += subtasks.filter(
                (s) => s.status === TaskStatus.COMPLETED || s.status === TaskStatus.SKIPPED
              ).length;
              this.totalSubtasksCount.set(total);
              this.completedSubtasksCount.set(completed);
              this.cdr.markForCheck();
            });
        });
      });
  }

  truncateString = Common.truncateString;

  toggleDetails(event: any) {
    event.stopPropagation();
    this.isExpandedDetails.update((v) => !v);
    this.cdr.markForCheck();
  }

  getAssigneeImageUrl(assignee: any): string {
    if (!assignee) return "assets/images/user.png";
    // If it's a profile object
    if (assignee.image_url) return assignee.image_url;
    // If it's a user object with a profile
    if (assignee.user?.profile?.image_url) return assignee.user.profile.image_url;
    if (assignee.profile?.image_url) return assignee.profile.image_url;
    return "assets/images/user.png";
  }

  getAssigneeUserId(assignee: any): string {
    if (!assignee) return "";
    // If it's a profile object
    if (assignee.user_id) return assignee.user_id;
    // If it's a user object
    if (assignee.id) return assignee.id;
    return "";
  }

  getProjectStatusColor(): string {
    if (!this.todo || this.todo.tasks_count === 0) {
      return "bg-gray-400";
    }

    const completed = this.todo.completed_tasks_count || 0;
    if (completed === this.todo.tasks_count) {
      return "bg-green-500";
    }
    return "bg-blue-500";
  }

  getProjectStatusText(): string {
    if (!this.todo || this.todo.tasks_count === 0) {
      return "No tasks";
    }
    const completed = this.todo.completed_tasks_count || 0;
    if (completed === this.todo.tasks_count) {
      return "Completed";
    }
    return "In Progress";
  }

  getPriorityBadgeClass = BaseItemHelper.getPriorityBadgeClass;

  formatDate = DateHelper.formatDateShort;

  archiveTodo() {
    if (this.todo) {
      this.archiveTodoEvent.emit(this.todo.id);
    }
  }

  restoreTodo() {
    if (this.todo) {
      this.restoreTodoEvent.emit(this.todo.id);
    }
  }

  deleteTodo() {
    if (this.todo) {
      this.deleteTodoEvent.emit(this.todo.id);
    }
  }

  get item() {
    return this.todo;
  }

  get updateEvent() {
    return this.updateTodoEvent;
  }

  onSaveAsBlueprint(event: any) {
    event.stopPropagation();
    if (this.todo) {
      this.saveAsBlueprintEvent.emit(this.todo);
    }
  }

  get countTasks(): number {
    return this.todo?.tasks_count ?? 0;
  }

  getTotalSubtasksCount(): number {
    return this.totalSubtasksCount();
  }

  getCompletedSubtasksCount(): number {
    return this.completedSubtasksCount();
  }

  toggleSelection(checked: boolean): void {
    if (this.todo) {
      this.selectionChangeEvent.emit({ id: this.todo.id, selected: checked });
    }
  }

  // Drag state management
  onDragStarted(): void {
    this.isDragging.set(true);
    this.cdr.markForCheck();
  }

  onDragEnded(): void {
    this.isDragging.set(false);
    this.cdr.markForCheck();
  }
}
