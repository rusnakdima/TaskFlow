/* sys lib */
import { CommonModule } from "@angular/common";
import {
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from "@angular/core";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { DragDropModule } from "@angular/cdk/drag-drop";

/* components */
import { CommentsComponent } from "@components/comments/comments.component";
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

/* helpers */
import { BaseItemHelper } from "@helpers/base-item.helper";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { StorageService } from "@services/core/storage.service";
import { ApiProvider } from "@providers/api.provider";

/* models */
import { Subtask } from "@models/subtask.model";
import { Comment } from "@models/comment.model";
import { Todo } from "@models/todo.model";

@Component({
  selector: "app-subtask-row",
  standalone: true,
  imports: [CommonModule, MatIconModule, DragDropModule, CommentsComponent, CheckboxComponent],
  templateUrl: "./subtask-row.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubtaskRowComponent {
  private authService = inject(AuthService);
  private storageService = inject(StorageService);
  private dataSyncProvider = inject(ApiProvider);
  private cdr = inject(ChangeDetectorRef);

  @Input() subtask: Subtask | null = null;
  @Input() todo: Todo | null = null;
  @Input() isOwner: boolean = true;
  @Input() isPrivate: boolean = true;
  @Input() isSelected: boolean = false;

  @Output() toggleCompletionEvent = new EventEmitter<Subtask>();
  @Output() selectionChangeEvent = new EventEmitter<{ id: string; selected: boolean }>();
  @Output() deleteSubtaskEvent = new EventEmitter<string>();
  @Output() addCommentEvent = new EventEmitter<{ content: string; subtask_id: string }>();
  @Output() deleteCommentEvent = new EventEmitter<string>();
  @Output() markAsReadEvent = new EventEmitter<string[]>();
  @Output() actionClickEvent = new EventEmitter<{ action: string; item: any }>();

  showComments = signal(false);

  getSubtaskStatusIcon = BaseItemHelper.getStatusIcon;
  getSubtaskStatusColor = BaseItemHelper.getStatusColor;
  getSubtaskPriorityColor = BaseItemHelper.getPriorityColor;

  get subtaskComments(): Comment[] {
    if (!this.subtask?.comments) return [];
    return this.subtask.comments.filter((c) => !c.deleted_at);
  }

  toggleCompletion() {
    if (this.subtask) {
      this.toggleCompletionEvent.emit(this.subtask);
    }
  }

  toggleComments() {
    this.showComments.update((v) => !v);
    this.cdr.markForCheck();
  }

  onSelectionChange(checked: boolean): void {
    if (this.subtask) {
      this.selectionChangeEvent.emit({ id: this.subtask.id, selected: checked });
    }
  }

  onAddComment(content: string) {
    if (this.subtask) {
      this.addCommentEvent.emit({ content, subtask_id: this.subtask.id });
    }
  }

  onDeleteComment(commentId: string) {
    this.deleteCommentEvent.emit(commentId);
  }

  onMarkAsRead(commentIds: string[]) {
    this.markAsReadEvent.emit(commentIds);
  }

  deleteSubtask() {
    if (this.subtask) {
      this.deleteSubtaskEvent.emit(this.subtask.id);
    }
  }

  onActionClick(action: string) {
    if (this.subtask) {
      this.actionClickEvent.emit({ action, item: this.subtask });
    }
  }
}
