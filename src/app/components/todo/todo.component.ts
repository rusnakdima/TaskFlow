/* sys lib */
import { CommonModule } from "@angular/common";
import {
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  signal,
  inject,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from "@angular/core";

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

/* services */
import { AuthService } from "@services/auth/auth.service";
import { NotifyService } from "@services/notifications/notify.service";
import { TemplateService } from "@services/features/template.service";

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
  ],
  templateUrl: "./todo.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TodoComponent extends BaseItemComponent implements OnInit {
  private authService = inject(AuthService);
  private notifyService = inject(NotifyService);
  private templateService = inject(TemplateService);

  @Input() isOwner: boolean = true;
  @Input() isPrivate: boolean = true;
  @Input() highlight: boolean = false;
  @Input() showActions: boolean = true;
  @Input() todo: Todo | null = null;
  @Input() index: number = 0;
  @Input() unreadCommentsCount: number = 0;
  @Input() isSelected: boolean = false;

  @Output() deleteTodoEvent: EventEmitter<string> = new EventEmitter();
  @Output() saveAsBlueprintEvent: EventEmitter<Todo> = new EventEmitter();
  @Output() selectionChangeEvent: EventEmitter<{ id: string; selected: boolean }> =
    new EventEmitter();

  isExpandedDetails = signal(false);
  isDragging = signal(false);

  ngOnInit() {
    // Force change detection when component initializes to ensure relation data is displayed
    this.cdr.markForCheck();
  }

  truncateString = Common.truncateString;

  toggleDetails(event: any) {
    event.stopPropagation();
    this.isExpandedDetails.update((v) => !v);
    this.cdr.markForCheck();
  }

  getAssigneeImageUrl(assignee: any): string {
    return assignee?.user?.profile?.imageUrl || "assets/images/user.png";
  }

  getAssigneeUserId(assignee: any): string {
    return assignee?.userId || "";
  }

  getProjectStatusColor(): string {
    if (!this.todo || !this.todo.tasks || this.todo.tasks.length === 0) {
      return "bg-gray-400";
    }

    const completed = BaseItemHelper.countCompleted(this.todo.tasks);
    if (completed === this.todo.tasks.length) {
      return "bg-green-500";
    }
    return "bg-blue-500";
  }

  getProjectStatusText(): string {
    if (!this.todo || !this.todo.tasks || this.todo.tasks.length === 0) {
      return "No tasks";
    }
    const completed = BaseItemHelper.countCompleted(this.todo.tasks);
    if (completed === this.todo.tasks.length) {
      return "Completed";
    }
    return "In Progress";
  }

  getPriorityBadgeClass = BaseItemHelper.getPriorityBadgeClass;

  formatDate = BaseItemHelper.formatDate;

  deleteTodo() {
    if (this.todo) {
      this.deleteTodoEvent.emit(this.todo.id);
    }
  }

  onSaveAsBlueprint(event: any) {
    event.stopPropagation();
    if (this.todo) {
      this.saveAsBlueprintEvent.emit(this.todo);
    }
  }

  get countTasks(): number {
    return this.todo?.tasks?.length ?? 0;
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
