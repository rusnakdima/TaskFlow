import { Injectable, inject, signal } from "@angular/core";
import { CommentService } from "@services/features/comment.service";
import { NotifyService } from "@services/notifications/notify.service";
import { AuthService } from "@services/auth/auth.service";
import { StorageService } from "@services/storage.service";
import { Visibility } from "@services/api.service";
import { logger } from "@services/logger.service";

@Injectable({ providedIn: "root" })
export class TasksCommentsHelper {
  private commentService = inject(CommentService);
  private notifyService = inject(NotifyService);
  private authService = inject(AuthService);
  private storageService = inject(StorageService);

  private _highlightCommentId = signal<string | null>(null);
  private _todoVisibility: Visibility = "private";

  setTodoVisibility(visibility: Visibility): void {
    this._todoVisibility = visibility;
  }

  onCommentToggle(taskId?: string): void {
    this._highlightCommentId.set(null);
    if (taskId) {
      this.storageService.ensureTaskCommentsLoaded(taskId, this._todoVisibility);
    }
  }

  onTaskCommentAdd(event: { content: string; itemId: string }): void {
    if (!event.content.trim()) return;
    this.commentService
      .createComment(event.content, { taskId: event.itemId, visibility: this._todoVisibility })
      .subscribe({
        next: (comment) => {
          this.storageService.addCommentToTask(comment, event.itemId);
        },
        error: () => {
          this.notifyService.showError("Failed to add comment");
        },
      });
  }

  onTaskCommentDelete(commentId: string): void {
    this.storageService.removeCommentFromAll(commentId);
  }

  onTaskCommentMarkAsRead(commentIds: string[]): void {
    const userId = this.authService.getValueByKey("id");
    if (userId) {
      this.commentService.markCommentsAsRead(commentIds, userId);
    }
  }

  onTaskSubtaskCommentAdd(event: { content: string; subtask_id: string; itemId: string }): void {
    if (!event.content.trim()) return;
    this.commentService
      .createComment(event.content, {
        subtaskId: event.subtask_id,
        visibility: this._todoVisibility,
      })
      .subscribe({
        next: (comment) => {
          this.storageService.addCommentToSubtask(comment, event.subtask_id);
        },
        error: (err) => {
          logger.error("Failed to add subtask comment", err);
          this.notifyService.showError("Failed to add comment");
        },
      });
  }
}
