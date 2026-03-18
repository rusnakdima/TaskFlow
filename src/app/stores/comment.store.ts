/**
 * Comment Store - Manages comment state using Angular signals
 *
 * Comments are stored flat (not nested in tasks/subtasks) for better performance
 * Relations to tasks/subtasks are maintained via foreign keys
 */

import { Injectable, signal, computed, Signal, WritableSignal } from "@angular/core";
import { Comment } from "@models/comment.model";
import {
  deduplicateAndFilterDeleted,
  addEntityToArray,
  removeEntityFromArray,
  updateEntityInArray,
  findById,
  groupByKey,
} from "./utils/store-helpers";

interface CommentState {
  comments: Comment[];
  loading: boolean;
  loaded: boolean;
  lastLoaded: Date | null;
}

const initialState: CommentState = {
  comments: [],
  loading: false,
  loaded: false,
  lastLoaded: null,
};

@Injectable({
  providedIn: "root",
})
export class CommentStore {
  private readonly state: WritableSignal<CommentState> = signal(initialState);

  // ==================== COMPUTED SIGNALS ====================

  readonly comments: Signal<Comment[]> = computed(() => {
    return deduplicateAndFilterDeleted(this.state().comments);
  });

  readonly loading: Signal<boolean> = computed(() => this.state().loading);
  readonly loaded: Signal<boolean> = computed(() => this.state().loaded);
  readonly lastLoaded: Signal<Date | null> = computed(() => this.state().lastLoaded);

  // ==================== QUERY METHODS ====================

  commentById(id: string): Comment | undefined {
    return findById(this.state().comments, id);
  }

  commentExists(id: string): boolean {
    return this.commentById(id) !== undefined;
  }

  /**
   * Get comments by task ID
   */
  commentsByTaskId(taskId: string): Signal<Comment[]> {
    return computed(() => this.comments().filter((comment) => comment.taskId === taskId));
  }

  /**
   * Get comments by subtask ID
   */
  commentsBySubtaskId(subtaskId: string): Signal<Comment[]> {
    return computed(() => this.comments().filter((comment) => comment.subtaskId === subtaskId));
  }

  /**
   * Get all comments for a task (including subtask comments)
   */
  allCommentsByTaskId(taskId: string): Signal<Comment[]> {
    return computed(() => {
      const taskComments = this.commentsByTaskId(taskId)();
      const subtaskComments = this.comments().filter(
        (comment) => comment.subtaskId && this.isSubtaskOfTask(comment.subtaskId, taskId)
      );
      return [...taskComments, ...subtaskComments];
    });
  }

  /**
   * Get comments grouped by task
   */
  readonly commentsGroupedByTask: Signal<Map<string, Comment[]>> = computed(() => {
    const comments = this.comments();
    return groupByKey(comments, (comment) => comment.taskId || "unknown");
  });

  // ==================== COMMAND METHODS ====================

  setLoading(loading: boolean): void {
    this.state.update((state) => ({ ...state, loading }));
  }

  setLoaded(loaded: boolean): void {
    this.state.update((state) => ({
      ...state,
      loaded,
      lastLoaded: loaded ? new Date() : state.lastLoaded,
    }));
  }

  setComments(comments: Comment[]): void {
    this.state.update((state) => ({ ...state, comments }));
  }

  addComment(comment: Comment): void {
    this.state.update((state) => ({
      ...state,
      comments: addEntityToArray(state.comments, comment),
    }));
  }

  updateComment(id: string, updates: Partial<Comment>): void {
    this.state.update((state) => ({
      ...state,
      comments: updateEntityInArray(state.comments, id, updates),
    }));
  }

  removeComment(id: string): void {
    this.state.update((state) => ({
      ...state,
      comments: removeEntityFromArray(state.comments, id),
    }));
  }

  restoreComment(id: string): void {
    this.updateComment(id, { isDeleted: false });
  }

  clear(): void {
    this.state.set(initialState);
  }

  /**
   * Bulk add/update comments (for sync operations)
   */
  bulkUpsertComments(comments: Comment[]): void {
    this.state.update((state) => {
      const commentMap = new Map(state.comments.map((c) => [c.id, c]));

      for (const comment of comments) {
        commentMap.set(comment.id, { ...commentMap.get(comment.id), ...comment });
      }

      return {
        ...state,
        comments: Array.from(commentMap.values()),
      };
    });
  }

  // ==================== HELPER METHODS ====================

  /**
   * Check if a subtask belongs to a specific task.
   * Uses comments that carry both subtaskId and taskId as a join table (M-3).
   * Falls back to true when no such comment exists yet (permissive — avoids hiding comments).
   */
  private isSubtaskOfTask(subtaskId: string, taskId: string): boolean {
    const linking = this.state().comments.find(
      (c) => c.subtaskId === subtaskId && c.taskId != null
    );
    if (linking) {
      return linking.taskId === taskId;
    }
    // No linking comment found — include the comment to avoid false negatives
    return true;
  }
}
