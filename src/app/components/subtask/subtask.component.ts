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

/* helpers */
import { Common } from "@helpers/common.helper";
import { BaseItemHelper } from "@helpers/base-item.helper";
import { DateHelper } from "@helpers/date.helper";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { UnifiedStorageService } from "@app/store/unified-storage.service";
import { NotifyService } from "@services/notifications/notify.service";
import { CommentService } from "@services/features/comment.service";
import { DataService } from "@services/data/data.service";
import { RequestService } from "@services/core/request.service";

/* models */
import {
  STATUS_BUTTON_COLORS,
  STATUS_BUTTON_ICONS,
  ActionColors,
} from "@constants/table-field.constants";
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
  private storageService = inject(UnifiedStorageService);
  private notifyService = inject(NotifyService);
  private commentService = inject(CommentService);
  private dataService = inject(DataService);
  private requestService = inject(RequestService);
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
    const colorKey = action as keyof typeof ActionColors;
    const baseClass = "rounded p-1 transition-colors";
    return `${baseClass} ${ActionColors[colorKey] || ActionColors.default}`;
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
      const visibility = this.isPrivate ? "private" : "shared";
      this.dataService
        .loadPage("comments", {
          filter: { subtask_id: this.subtask.id },
          visibility,
          skip: 0,
          limit: 20,
        })
        .subscribe({
          next: () => {
            this.cdr.markForCheck();
          },
          error: () => {
            this.notifyService.showError("Failed to load comments");
          },
        });

      const subtaskId = this.subtask.id;
      const userId = this.authService.getValueByKey("id");
      const subtaskComments = this.comments().filter(
        (c: Comment) => c.subtask_id === subtaskId && !c.deleted_at
      );
      if (userId && subtaskComments.length > 0) {
        const hasUnread = subtaskComments.some(
          (c: Comment) =>
            c.subtask_id && c.user_id !== userId && (!c.read_by || !c.read_by.includes(userId))
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

          this.storageService.updateItem("subtasks", this.subtask.id, {
            ...this.subtask,
          });

          const effectiveTodoId: string | null = this.todo_id;
          if (!effectiveTodoId && this.subtask.task_id) {
            const taskReactive = this.storageService.getTaskReactive(this.subtask.task_id);
            const task = taskReactive();
            if (task?.todo_id) {
              this.handleCommentsRead(updatedComments, task.todo_id, userId);
            }
          } else if (effectiveTodoId) {
            this.handleCommentsRead(updatedComments, effectiveTodoId, userId);
          }
        }
      }
    }

    this.cdr.markForCheck();
  }

  private handleCommentsRead(comments: Comment[], todoId: string, userId: string) {
    if (!this.subtask) return;
    const commentsToUpdate = comments.filter(
      (c: Comment) => !c.deleted_at && c.subtask_id === this.subtask?.id && c.user_id !== userId
    );

    if (commentsToUpdate.length > 0) {
      this.dataService
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
    if (!this.subtask) return;
    let effectiveTodoId: string | null = this.todo_id;

    if (!effectiveTodoId && this.subtask.task_id) {
      const taskReactive = this.storageService.getTaskReactive(this.subtask.task_id);
      const task = taskReactive();
      if (task?.todo_id) {
        effectiveTodoId = task.todo_id;
        this.createComment(content, effectiveTodoId);
      }
    } else if (effectiveTodoId) {
      this.createComment(content, effectiveTodoId);
    }
  }

  private createComment(content: string, effectiveTodoId: string) {
    if (!this.subtask) return;

    if (!effectiveTodoId) {
      this.notifyService.showError("Cannot add comment: User or Project not found");
      return;
    }

    this.commentService
      .createComment(content, effectiveTodoId, {
        subtaskId: this.subtask.id,
        visibility: this.isPrivate ? "private" : "shared",
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
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
    this.dataService
      .delete("comments", commentId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: (err) => {},
      });
  }

  onMarkAsRead(commentIds: string[]) {
    const userId = this.authService.getValueByKey("id");
    let effectiveTodoId: string | null = this.todo_id;
    if (!this.subtask || !userId || commentIds.length === 0) return;

    if (!effectiveTodoId && this.subtask.task_id) {
      const dataService = inject(DataService);
      dataService.get<Task>("tasks", this.subtask.task_id).subscribe((task) => {
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
    this.dataService
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

  toggleSelection(checked: boolean): void {
    if (this.subtask) {
      this.selectionChangeEvent.emit({ id: this.subtask.id, selected: checked });
    }
  }
}
