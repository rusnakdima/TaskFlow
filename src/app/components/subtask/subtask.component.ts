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
} from "@angular/core";
import { RouterModule } from "@angular/router";
import { FormsModule } from "@angular/forms";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { DragDropModule } from "@angular/cdk/drag-drop";

/* components */
import { CommentsComponent } from "@components/comments/comments.component";

/* helpers */
import { Common } from "@helpers/common.helper";
import { BaseItemHelper } from "@helpers/base-item.helper";

/* services */
import { AuthService } from "@services/auth.service";

/* models */
import { Subtask } from "@models/subtask.model";
import { Comment } from "@models/comment.model";

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
  ],
  templateUrl: "./subtask.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubtaskComponent {
  private baseHelper = inject(BaseItemHelper);
  private authService = inject(AuthService);

  constructor(private cdr: ChangeDetectorRef) {}

  @Input() subtask: Subtask | null = null;
  @Input() index: number = 0;
  @Input() isPrivate: boolean = true;

  @Output() deleteSubtaskEvent: EventEmitter<string> = new EventEmitter();
  @Output() toggleCompletionEvent: EventEmitter<Subtask> = new EventEmitter();
  @Output() updateSubtaskEvent: EventEmitter<{ subtask: Subtask; field: string; value: any }> =
    new EventEmitter();

  editingField = signal<string | null>(null);
  editingValue = signal("");
  showComments = signal(false);

  truncateString = Common.truncateString;

  get hasUnreadComments(): boolean {
    if (!this.subtask || !this.subtask.comments) return false;
    const userId = this.authService.getValueByKey("id");
    if (!userId) return false;
    return this.subtask.comments.some((c) => !c.readBy || !c.readBy.includes(userId));
  }

  getPriorityColor = this.baseHelper.getPriorityBadgeClass;

  toggleComments() {
    this.showComments.update((v) => !v);
    this.cdr.markForCheck();
  }

  onAddComment(content: string) {
    const userId = this.authService.getValueByKey("id");
    const username = this.authService.getValueByKey("username");

    if (this.subtask && userId) {
      const newComment: Comment = {
        id: crypto.randomUUID(),
        authorId: userId,
        authorName: username || "Unknown",
        content: content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        taskId: this.subtask.taskId,
        subtaskId: this.subtask.id,
        readBy: [userId],
      };

      const updatedComments = [...(this.subtask.comments || []), newComment];
      this.updateSubtaskEvent.emit({
        subtask: this.subtask,
        field: "comments",
        value: updatedComments,
      });
    }
  }

  onDeleteComment(commentId: string) {
    if (this.subtask) {
      const updatedComments = (this.subtask.comments || []).filter((c) => c.id !== commentId);
      this.updateSubtaskEvent.emit({
        subtask: this.subtask,
        field: "comments",
        value: updatedComments,
      });
    }
  }

  onMarkAsRead(commentIds: string[]) {
    const userId = this.authService.getValueByKey("id");
    if (this.subtask && userId && commentIds.length > 0) {
      let changed = false;
      const updatedComments = (this.subtask.comments || []).map((c) => {
        if (commentIds.includes(c.id)) {
          const readBy = c.readBy || [];
          if (!readBy.includes(userId)) {
            changed = true;
            return { ...c, readBy: [...readBy, userId] };
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

  startInlineEdit(field: string, currentValue: string) {
    this.editingField.set(field);
    this.editingValue.set(currentValue);
    this.cdr.markForCheck();

    setTimeout(() => {
      const input = document.querySelector("input:focus, textarea:focus") as HTMLInputElement;
      if (input) {
        input.select();
      }
    }, 0);
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

  cancelInlineEdit() {
    this.editingField.set(null);
    this.editingValue.set("");
    this.cdr.markForCheck();
  }

  deleteSubtask() {
    if (this.subtask) {
      this.deleteSubtaskEvent.emit(this.subtask.id);
    }
  }
}
