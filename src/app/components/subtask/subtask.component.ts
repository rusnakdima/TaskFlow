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
  DestroyRef,
  effect,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";

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
import { StatusToggleComponent } from "@components/status-toggle/status-toggle.component";

/* helpers */
import { Common } from "@helpers/common.helper";
import { BaseItemHelper } from "@helpers/base-item.helper";
import { DateHelper } from "@helpers/date.helper";
import { getActionColor } from "@helpers/action-color.helper";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { StorageService } from "@services/storage.service";
import { NotifyService } from "@services/notifications/notify.service";
import { CommentService } from "@services/features/comment.service";
import { REQUEST_SERVICE } from "@services/api.service";

/* models */
import {
  STATUS_BUTTON_COLORS,
  STATUS_BUTTON_ICONS,
  ActionColors,
} from "@constants/table-field.constants";
import { Subtask } from "@models/subtask.model";
import { TaskStatus } from "@models/task.model";
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
    StatusToggleComponent,
  ],
  templateUrl: "./subtask.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubtaskComponent extends BaseItemComponent implements OnChanges {
  private authService = inject(AuthService);
  private storageService = inject(StorageService);
  private notifyService = inject(NotifyService);
  private commentService = inject(CommentService);
  private requestService = inject(REQUEST_SERVICE);
  private destroyRef = inject(DestroyRef);

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
  @Output() cardClick = new EventEmitter<{ event: MouseEvent; id: string }>();

  showComments = signal(false);
  loadingSubtaskComments = signal(false);
  comments = signal<Comment[]>([]);
  isExpandedDetails = signal(false);

  get menuClass(): string {
    return "subtask-menu";
  }

  getStatusBgColor(status: string): string {
    return (
      STATUS_BUTTON_COLORS[status as keyof typeof STATUS_BUTTON_COLORS] ||
      STATUS_BUTTON_COLORS["pending"]
    );
  }

  getStatusIcon(status: string): string {
    return (
      STATUS_BUTTON_ICONS[status as keyof typeof STATUS_BUTTON_ICONS] ||
      STATUS_BUTTON_ICONS["pending"]
    );
  }

  getActionColor(action: string): string {
    return getActionColor(action, "rounded p-1 transition-colors");
  }

  truncateString = Common.truncateString;

  toggleDetails(event: any) {
    event.stopPropagation();
    this.isExpandedDetails.update((v) => !v);
    this.cdr.markForCheck();
  }

  formatDate = DateHelper.formatDateShort;

  constructor() {
    super();
    effect(() => {
      this.comments.set(this.storageService.comments());
    });
  }

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

  getActiveComments(comments: Comment[] | undefined): Comment[] {
    if (!comments || comments.length === 0) return [];
    return comments.filter((c: Comment) => !c.deleted_at);
  }

  getSubtaskComments(subtaskId: string): Comment[] {
    return this.comments().filter((c: Comment) => c.subtask_id === subtaskId && !c.deleted_at);
  }

  toggleComments() {
    const wasOpen = this.showComments();
    this.showComments.update((v) => !v);

    if (!wasOpen && this.subtask) {
      const subtaskId = this.subtask.id;
      const subtask = this.subtask;
      const visibility = this.isPrivate ? "private" : "shared";
      this.requestService
        .loadPage("comments", {
          filter: { subtask_id: subtaskId },
          visibility,
          skip: 0,
          limit: 20,
        })
        .subscribe({
          next: () => {
            this.cdr.markForCheck();
            const userId = this.authService.getValueByKey("id");
            const subtaskComments = this.comments().filter(
              (c: Comment) => c.subtask_id === subtaskId && !c.deleted_at
            );
            if (userId && subtaskComments.length > 0) {
              const hasUnread = subtaskComments.some(
                (c: Comment) =>
                  c.subtask_id &&
                  c.user_id !== userId &&
                  (!c.read_by || !c.read_by.includes(userId))
              );

              if (hasUnread) {
                const updatedComments = subtaskComments.map((c: Comment) => {
                  if (c.deleted_at || !c.subtask_id) return c;
                  if (c.user_id === userId) return c;

                  if (!c.read_by || !c.read_by.includes(userId)) {
                    return {
                      ...c,
                      read_by: [...(c.read_by || []), userId],
                    };
                  }
                  return c;
                });

                const effectiveTodoId: string | null = this.todo_id;
                if (!effectiveTodoId && subtask.task_id) {
                  const taskReactive = this.storageService.getTaskReactive(subtask.task_id);
                  const task = taskReactive();
                  if (task?.todo_id) {
                    this.handleCommentsRead(updatedComments, task.todo_id, userId);
                  }
                } else if (effectiveTodoId) {
                  this.handleCommentsRead(updatedComments, effectiveTodoId, userId);
                }
              }
            }
          },
          error: () => {
            this.notifyService.showError("Failed to load comments");
          },
        });
    }

    this.cdr.markForCheck();
  }

  private handleCommentsRead(comments: Comment[], todoId: string, userId: string) {
    if (!this.subtask) return;
    const commentsToUpdate = comments.filter(
      (c: Comment) => !c.deleted_at && c.subtask_id === this.subtask?.id && c.user_id !== userId
    );

    if (commentsToUpdate.length > 0) {
      this.requestService
        .updateAll(
          "comments",
          commentsToUpdate.map((c) => ({ id: c.id, read_by: c.read_by }))
        )
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {},
          error: (err) => {
            console.error("Mark comments read failed:", err);
          },
        });
    }
  }

  onAddComment(content: string) {
    console.log("[Subtask] onAddComment called, content:", content, "subtask:", this.subtask?.id);
    if (!this.subtask) {
      console.log("[Subtask] No subtask, returning");
      return;
    }
    let effectiveTodoId: string | null = this.todo_id;
    console.log("[Subtask] effectiveTodoId from todo_id:", effectiveTodoId);

    if (!effectiveTodoId && this.subtask.task_id) {
      const taskReactive = this.storageService.getTaskReactive(this.subtask.task_id);
      const task = taskReactive();
      console.log("[Subtask] task from storage:", task?.id, "todo_id:", task?.todo_id);
      if (task?.todo_id) {
        effectiveTodoId = task.todo_id;
        this.createComment(content, effectiveTodoId);
      } else {
        console.log("[Subtask] No todo_id found in task");
      }
    } else if (effectiveTodoId) {
      console.log("[Subtask] Using effectiveTodoId:", effectiveTodoId);
      this.createComment(content, effectiveTodoId);
    } else {
      console.log("[Subtask] No effectiveTodoId found, cannot create comment");
    }
  }

  private createComment(content: string, effectiveTodoId: string) {
    console.log("[Subtask] createComment called, content:", content, "todoId:", effectiveTodoId);
    if (!this.subtask) {
      console.log("[Subtask] createComment: no subtask, returning");
      return;
    }

    if (!effectiveTodoId) {
      console.log("[Subtask] createComment: no effectiveTodoId");
      this.notifyService.showError("Cannot add comment: User or Project not found");
      return;
    }

    console.log("[Subtask] createComment: calling commentService.createComment", {
      subtaskId: this.subtask.id,
      visibility: this.isPrivate ? "private" : "shared",
    });

    this.commentService
      .createComment(content, effectiveTodoId, {
        subtaskId: this.subtask.id,
        visibility: this.isPrivate ? "private" : "shared",
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (comment) => {
          console.log("[Subtask] createComment: success, comment:", comment);
          this.showComments.set(true);
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error("[Subtask] createComment: error:", err);
          this.notifyService.showError(err.message || "Failed to add comment");
        },
      });
  }

  onDeleteComment(commentId: string) {
    let effectiveTodoId: string | null = this.todo_id;

    if (!effectiveTodoId && this.subtask?.task_id) {
      const taskReactive = this.storageService.getTaskReactive(this.subtask.task_id);
      const task = taskReactive();
      if (task?.todo_id) {
        effectiveTodoId = task.todo_id;
        this.deleteComment(commentId, effectiveTodoId);
      }
    } else if (effectiveTodoId) {
      this.deleteComment(commentId, effectiveTodoId);
    }
  }

  private deleteComment(commentId: string, effectiveTodoId: string) {
    this.requestService
      .delete("comments", commentId, { visibility: this.isPrivate ? "private" : "shared" })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: (err) => {},
      });
  }

  onMarkAsRead(commentIds: string[]) {
    const userId = this.authService.getValueByKey("id");
    let effectiveTodoId: string | null = this.todo_id;
    if (!this.subtask || !userId || commentIds.length === 0) return;

    const visibility = this.isPrivate ? "private" : "shared";
    if (!effectiveTodoId && this.subtask.task_id) {
      this.requestService
        .get<Task>("tasks", this.subtask.task_id, { visibility } as any)
        .subscribe((task) => {
          if (task?.todo_id) {
            effectiveTodoId = task.todo_id;
            this.commentService.markCommentsAsRead(commentIds, userId, effectiveTodoId!);
          }
        });
    } else if (effectiveTodoId) {
      this.commentService.markCommentsAsRead(commentIds, userId, effectiveTodoId);
    }
  }

  onLoadMoreSubtaskComments() {
    if (!this.subtask || this.loadingSubtaskComments()) return;
    const visibility = this.isPrivate ? "private" : "shared";
    this.loadingSubtaskComments.set(true);
    this.requestService
      .loadMore("comments")
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.loadingSubtaskComments.set(false);
          this.cdr.markForCheck();
        },
        error: () => {
          this.loadingSubtaskComments.set(false);
          this.notifyService.showError("Failed to load more comments");
        },
      });
  }

  toggleCompletion() {
    if (this.subtask) {
      this.toggleCompletionEvent.emit(this.subtask);
      this.cdr.markForCheck();
    }
  }

  onStatusToggle(newStatus: TaskStatus) {
    if (this.subtask) {
      this.toggleCompletionEvent.emit(this.subtask);
      this.cdr.markForCheck();
    }
  }

  get item() {
    return this.subtask;
  }

  get updateEvent() {
    return this.updateSubtaskEvent;
  }

  deleteSubtask() {
    if (this.subtask) {
      this.deleteSubtaskEvent.emit(this.subtask.id);
    }
  }

  toggleSelection(result: { checked: boolean; event?: MouseEvent }): void {
    if (this.subtask) {
      this.selectionChangeEvent.emit({ id: this.subtask.id, selected: result.checked });
    }
  }

  onCardClick(event: MouseEvent): void {
    if (this.subtask) {
      this.cardClick.emit({ event, id: this.subtask.id });
    }
  }
}
