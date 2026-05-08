import { Injectable, inject } from "@angular/core";
import { AuthService } from "@services/auth/auth.service";
import { StorageService } from "@services/storage.service";
import { Observable, map } from "rxjs";
import { Comment } from "@models/comment.model";
import { REQUEST_SERVICE, Visibility } from "@services/api.service";

export interface CommentPayload {
  user_id: string;
  content: string;
  task_id?: string;
  subtask_id?: string;
  read_by: string[];
  deleted_at: string | null;
}

export interface MarkCommentsResult {
  updatedComments: Comment[];
  hasChanges: boolean;
}

@Injectable({ providedIn: "root" })
export class CommentService {
  private authService = inject(AuthService);
  private storageService = inject(StorageService);
  private requestService = inject(REQUEST_SERVICE);

  createComment(
    content: string,
    parentTodoId: string,
    options: { taskId?: string; subtaskId?: string; visibility?: "private" | "shared" }
  ): Observable<Comment> {
    const userId = this.authService.getValueByKey("id");
    const payload: CommentPayload = {
      user_id: userId,
      content,
      task_id: options.taskId,
      subtask_id: options.subtaskId,
      read_by: [userId],
      deleted_at: null,
    };

    return this.requestService
      .create<
        CommentPayload & { id?: string; created_at?: string; updated_at?: string }
      >("comments", payload, { visibility: (options.visibility || "private") as Visibility })
      .pipe(
        map(
          (response) =>
            ({
              ...response,
              id: response.id || crypto.randomUUID(),
              created_at: response.created_at || new Date().toISOString(),
              updated_at: response.updated_at || new Date().toISOString(),
              deleted_at: response.deleted_at ?? null,
            }) as Comment
        )
      );
  }

  markCommentsAsRead(
    commentIds: string[],
    userId: string,
    parentTodoId: string
  ): MarkCommentsResult {
    const allComments = this.storageService.comments();
    const comments = allComments.filter((c) => commentIds.includes(c.id));
    const toUpdate = comments.filter((c) => !c.read_by?.includes(userId));

    if (toUpdate.length === 0) return { updatedComments: [], hasChanges: false };

    const updatedComments: Comment[] = [];
    toUpdate.forEach((c) => {
      const updatedReadBy = [...(c.read_by || []), userId];
      updatedComments.push({ ...c, read_by: updatedReadBy });
      this.storageService.updateItem("comments", c.id, { read_by: updatedReadBy });
    });

    this.requestService
      .updateAll(
        "comments",
        toUpdate.map((c) => ({ id: c.id, read_by: c.read_by }))
      )
      .subscribe();

    return { updatedComments, hasChanges: true };
  }

  markAsRead(commentId: string, userId: string, parentTodoId: string): MarkCommentsResult {
    return this.markCommentsAsRead([commentId], userId, parentTodoId);
  }

  getUnreadCountForTask(taskId: string, userId: string): number {
    const subtasks = this.storageService.getSubtasksByTaskId(taskId);
    let count = 0;
    for (const subtask of subtasks) {
      const allComments = this.storageService.comments();
      const comments = allComments.filter((c) => c.subtask_id === subtask.id && !c.deleted_at);
      count += comments.filter(
        (c) => c.user_id !== userId && (!c.read_by || !c.read_by.includes(userId))
      ).length;
    }
    return count;
  }
}
