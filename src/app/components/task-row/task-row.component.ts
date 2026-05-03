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

/* materials */
import { MatIconModule } from "@angular/material/icon';

/* components */
import { CommentsComponent } from "@components/comments/comments.component";
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

/* helpers */
import { BaseItemHelper } from "@helpers/base-item.helper";
import { DateHelper } from "@helpers/date.helper";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { StorageService } from "@services/core/storage.service";
import { ApiProvider } from "@providers/api.provider";

/* models */
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Comment } from "@models/comment.model";
import { Todo } from "@models/todo.model";

@Component({
  selector: "app-task-row",
  standalone: true,
  imports: [CommonModule, MatIconModule, CommentsComponent, CheckboxComponent],
  templateUrl: "./task-row.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskRowComponent {
  private authService = inject(AuthService);
  private storageService = inject(StorageService);
  private dataSyncProvider = inject(ApiProvider);
  private cdr = inject(ChangeDetectorRef);

  @Input() task: Task | null = null;
  @Input() todo: Todo | null = null;
  @Input() isOwner: boolean = true;
  @Input() isPrivate: boolean = true;
  @Input() isExpanded: boolean = false;
  @Input() isSelected: boolean = false;
  @Input() highlight: boolean = false;
  @Input() highlightCommentId: string | null = null;

  @Output() toggleExpandEvent = new EventEmitter<Task>();
  @Output() toggleSubtaskCompletionEvent = new EventEmitter<Subtask>();
  @Output() selectionChangeEvent = new EventEmitter<{ id: string; selected: boolean }>();
  @Output() deleteTaskEvent = new EventEmitter<string>();
  @Output() addCommentEvent = new EventEmitter<{ content: string; task_id: string }>();
  @Output() deleteCommentEvent = new EventEmitter<string>();
  @Output() markAsReadEvent = new EventEmitter<string[]>();
  @Output() actionClickEvent = new EventEmitter<{ action: string; item: any }>();

  showComments = signal(false);

  getSubtaskStatusIcon = BaseItemHelper.getStatusIcon;
  getSubtaskStatusColor = BaseItemHelper.getStatusColor;
  getSubtaskPriorityColor = BaseItemHelper.getPriorityColor;
  getPriorityColor = BaseItemHelper.getPriorityBadgeClass;

  get totalSubtasks(): number {
    return this.task?.subtasks?.length ?? 0;
  }

  get taskComments(): Comment[] {
    if (!this.task?.comments) return [];
    return this.task.comments.filter((c) => !c.deleted_at);
  }

  toggleExpand() {
    if (this.task) {
      this.toggleExpandEvent.emit(this.task);
    }
  }

  toggleComments() {
    this.showComments.update((v) => !v);
    this.cdr.markForCheck();
  }

  toggleSubtaskCompletion(subtask: Subtask) {
    this.toggleSubtaskCompletionEvent.emit(subtask);
  }

  onSelectionChange(checked: boolean): void {
    if (this.task) {
      this.selectionChangeEvent.emit({ id: this.task.id, selected: checked });
    }
  }

  onAddComment(content: string) {
    if (this.task) {
      this.addCommentEvent.emit({ content, task_id: this.task.id });
    }
  }

  onDeleteComment(commentId: string) {
    this.deleteCommentEvent.emit(commentId);
  }

  onMarkAsRead(commentIds: string[]) {
    this.markAsReadEvent.emit(commentIds);
  }

  deleteTask() {
    if (this.task) {
      this.deleteTaskEvent.emit(this.task.id);
    }
  }

  onActionClick(action: string) {
    if (this.task) {
      this.actionClickEvent.emit({ action, item: this.task });
    }
  }
}