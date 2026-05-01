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
  OnChanges,
  SimpleChanges,
} from "@angular/core";

/* base */
import { BaseItemComponent } from "@components/base-item.component";
import { RouterModule } from "@angular/router";
import { FormsModule } from "@angular/forms";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { DragDropModule } from "@angular/cdk/drag-drop";

/* components */
import { CommentsComponent } from "@components/comments/comments.component";
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

/* helpers */
import { Common } from "@helpers/common.helper";
import { BaseItemHelper } from "@helpers/base-item.helper";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { StorageService } from "@services/core/storage.service";
import { ApiProvider } from "@providers/api.provider";
import { NotifyService } from "@services/notifications/notify.service";

/* models */
import { Subtask } from "@models/subtask.model";
import { Comment } from "@models/comment.model";
import { Task } from "@models/task.model";

@Component({
  selector: "app-subtask",
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatIconModule,
    DragDropModule,
    CommentsComponent,
    CheckboxComponent,
  ],
  templateUrl: "./subtask.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubtaskComponent extends BaseItemComponent implements OnChanges {
  private authService = inject(AuthService);
  private storageService = inject(StorageService);
  private dataSyncProvider = inject(ApiProvider);
  private notifyService = inject(NotifyService);

  @Input() isOwner: boolean = true;
  @Input() isPrivate: boolean = true;
  @Input() highlight: boolean = false;
  @Input() showActions: boolean = true;
  @Input() subtask: Subtask | null = null;
  @Input() todo_id: string | null = null;
  @Input() index: number = 0;
  @Input() highlightComment: string | null = null;
  @Input() openComments: boolean = false;
  @Input() unreadCommentsCount: number = 0;
  @Input() isSelected: boolean = false;

  @Output() deleteSubtaskEvent: EventEmitter<string> = new EventEmitter();
  @Output() toggleCompletionEvent: EventEmitter<Subtask> = new EventEmitter();
  @Output() updateSubtaskEvent: EventEmitter<{ subtask: Subtask; field: string; value: any }> =
    new EventEmitter();
  @Output() selectionChangeEvent: EventEmitter<{ id: string; selected: boolean }> =
    new EventEmitter();

  showComments = signal(false);

  truncateString = Common.truncateString;

  ngOnChanges(changes: SimpleChanges) {
    if (changes["openComments"]?.currentValue === true) {
      this.showComments.set(true);
      this.cdr.markForCheck();
    }
    if (changes["highlightComment"]?.currentValue) {
      this.showComments.set(true);
      this.cdr.markForCheck();
    }
  }

  get hasUnreadComments(): boolean {
    return this.unreadCommentsCount > 0;
  }

  getPriorityColor = BaseItemHelper.getPriorityBadgeClass;

  /**
   * Filter out deleted comments
   */
  getActiveComments(comments: Comment[] | undefined): Comment[] {
    if (!comments || comments.length === 0) return [];
    return comments.filter((c) => !c.deleted_at);
  }

  toggleComments() {
    const wasOpen = this.showComments();
    this.showComments.update((v) => !v);

    if (!wasOpen && this.subtask) {
      const userId = this.authService.getValueByKey("id");
      if (userId && this.subtask.comments && this.subtask.comments.length > 0) {
        const hasUnread = this.subtask.comments.some(
          (c: any) =>
            !c.deleted_at &&
            c.subtask_id &&
            c.user_id !== userId &&
            (!c.read_by || !c.read_by.includes(userId))
        );

        if (hasUnread) {
          const updatedComments = this.subtask.comments.map((c: any) => {
            if (c.deleted_at || !c.subtask_id) return c;
            if (c.user_id === userId) return c;

            if (!c.read_by || !c.read_by.includes(userId)) {
              return {
                ...c,
                readBy: [...(c.read_by || []), userId],
              };
            }
            return c;
          });

          this.storageService.updateItem("subtasks", this.subtask.id, {
            ...this.subtask,
            comments: updatedComments,
          });

          const effectiveTodoId =
            this.todo_id || this.storageService.getById("tasks", this.subtask.task_id)?.todo_id;
          if (effectiveTodoId) {
            const commentsToUpdate = updatedComments.filter(
              (c: any) => !c.deleted_at && c.subtask_id === this.subtask?.id && c.user_id !== userId
            );

            if (commentsToUpdate.length > 0) {
              this.dataSyncProvider
                .crud("updateAll", "comments", {
                  data: commentsToUpdate.map((c: any) => ({ id: c.id, read_by: c.read_by })),
                  parentTodoId: effectiveTodoId,
                })
                .subscribe();
            }
          }
        }
      }
    }

    this.cdr.markForCheck();
  }

  onAddComment(content: string) {
    if (this.subtask) {
      const userId = this.authService.getValueByKey("id");
      const effectiveTodoId =
        this.todo_id || this.storageService.getById("tasks", this.subtask.task_id)?.todo_id;

      if (!userId || !effectiveTodoId) {
        this.notifyService.showError("Cannot add comment: User or Project not found");
        return;
      }

      const commentForBackend: any = {
        user_id: userId,
        content: content,
        subtask_id: this.subtask.id,
        read_by: [userId],
        deleted_at: null,
      };

      this.dataSyncProvider
        .crud<Comment>("create", "comments", {
          data: commentForBackend,
          parentTodoId: effectiveTodoId,
          visibility: this.isPrivate ? "private" : "team",
        })
        .subscribe({
          next: () => {
            this.showComments.set(true);
            this.cdr.markForCheck();
          },
          error: (err) => {
            this.notifyService.showError(err.message || "Failed to add comment");
          },
        });
    }
  }

  onDeleteComment(commentId: string) {
    const effectiveTodoId =
      this.todo_id ||
      (this.subtask && this.storageService.getById("tasks", this.subtask.task_id)?.todo_id);
    if (effectiveTodoId) {
      this.dataSyncProvider
        .crud("delete", "comments", { id: commentId, parentTodoId: effectiveTodoId })
        .subscribe({
          error: (err) => console.error("Subtask operation failed:", err),
        });
    }
  }

  onMarkAsRead(commentIds: string[]) {
    const userId = this.authService.getValueByKey("id");
    if (this.subtask && userId && commentIds.length > 0) {
      let changed = false;
      const updatedComments = (this.subtask.comments || []).map((c) => {
        if (commentIds.includes(c.id)) {
          const readBy = c.read_by || [];
          if (!readBy.includes(userId)) {
            changed = true;
            return { ...c, readBy: [...(c.read_by || []), userId] };
          }
        }
        return c;
      });

      if (changed) {
        this.updateSubtaskEvent.emit({
          subtask: this.subtask,
          field: "comments",
          value: updatedComments,
        });
      }
    }
  }

  toggleCompletion() {
    if (this.subtask) {
      this.toggleCompletionEvent.emit(this.subtask);
      this.cdr.markForCheck();
    }
  }

  saveInlineEdit() {
    if (this.editingValue().trim() && this.editingField() && this.subtask) {
      const originalValue =
        this.editingField() === "title" ? this.subtask.title : this.subtask.description;
      if (this.editingValue().trim() !== originalValue) {
        this.updateSubtaskEvent.emit({
          subtask: this.subtask,
          field: this.editingField()!,
          value: this.editingValue().trim(),
        });
      }
    }
    this.cancelInlineEdit();
  }

  deleteSubtask() {
    if (this.subtask) {
      this.deleteSubtaskEvent.emit(this.subtask.id);
    }
  }

  toggleSelection(checked: boolean): void {
    if (this.subtask) {
      this.selectionChangeEvent.emit({ id: this.subtask.id, selected: checked });
    }
  }
}
