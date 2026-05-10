import { Injectable, inject, signal } from "@angular/core";
import { CommentService } from "@services/features/comment.service";
import { NotifyService } from "@services/notifications/notify.service";
import { AuthService } from "@services/auth/auth.service";
import { StorageService } from "@services/storage.service";
import { REQUEST_SERVICE, Visibility } from "@services/api.service";

@Injectable({ providedIn: "root" })
export class TasksCommentsHelper {
  private commentService = inject(CommentService);
  private notifyService = inject(NotifyService);
  private authService = inject(AuthService);
  private storageService = inject(StorageService);
  private requestService = inject(REQUEST_SERVICE);

  private _highlightCommentId = signal<string | null>(null);
  private _todoVisibility: Visibility = "private";

  setTodoVisibility(visibility: Visibility): void {
    this._todoVisibility = visibility;
  }

  onCommentToggle(taskId?: string): void {
    this._highlightCommentId.set(null);
    if (taskId) {
      this.loadCommentsForTask(taskId);
    }
  }

  private loadCommentsForTask(taskId: string): void {
    this.requestService
      .loadPage("comments", {
        filter: { task_id: taskId },
        visibility: this._todoVisibility,
        skip: 0,
        limit: 100,
      })
      .subscribe();
  }

  onTaskCommentAdd(event: { content: string; itemId: string }): void {
    if (!event.content.trim()) return;
    this.commentService.createComment(event.content, { taskId: event.itemId }).subscribe({
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
    this.commentService.createComment(event.content, { subtaskId: event.subtask_id }).subscribe({
      next: (comment) => {
        this.storageService.addCommentToSubtask(comment, event.subtask_id);
      },
      error: (err) => {
        console.error("[TasksView] Failed to add subtask comment:", err);
        this.notifyService.showError("Failed to add comment");
      },
    });
  }
}
