/* sys lib */
import { CommonModule } from "@angular/common";
import {
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  signal,
  inject,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  computed,
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
import { ProgressBarComponent } from "@components/progress-bar/progress-bar.component";
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

/* helpers */
import { Common } from "@helpers/common.helper";
import { BaseItemHelper } from "@helpers/base-item.helper";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { StorageService } from "@services/core/storage.service";
import { DataSyncProvider } from "@providers/data-sync.provider";
import { NotifyService } from "@services/notifications/notify.service";
import { Router } from "@angular/router";

/* models */
import { Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Comment } from "@models/comment.model";

@Component({
  selector: "app-task",
  standalone: true,
  host: { style: "display: block;" },
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatIconModule,
    DragDropModule,
    CommentsComponent,
    ProgressBarComponent,
    CheckboxComponent,
  ],
  templateUrl: "./task.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskComponent extends BaseItemComponent implements OnInit, OnChanges {
  private authService = inject(AuthService);
  private storageService = inject(StorageService);
  private dataSyncProvider = inject(DataSyncProvider);
  private notifyService = inject(NotifyService);
  private router = inject(Router);

  @Input() isOwner: boolean = true;
  @Input() isPrivate: boolean = true;
  @Input() highlight: boolean = false;
  @Input() showActions: boolean = true;
  @Input() task: Task | null = null;
  @Input() todoId: string | null = null;
  @Input() index: number = 0;
  @Input() isExpanded: boolean = false;
  @Input() isSelected: boolean = false;
  @Input() allTasks: Task[] = [];
  @Input() showExpandButton: boolean = false;
  @Input() highlightCommentId: string | null = null;
  @Input() autoOpenComments: boolean = false;
  @Input() unreadCommentsCount: number = 0;

  @Output() deleteTaskEvent: EventEmitter<string> = new EventEmitter();
  @Output() toggleCompletionEvent: EventEmitter<Task> = new EventEmitter();
  @Output() updateTaskEvent: EventEmitter<{ task: Task; field: string; value: any }> =
    new EventEmitter();
  @Output() toggleSubtasksEvent: EventEmitter<Task> = new EventEmitter();
  @Output() toggleSubtaskCompletionEvent: EventEmitter<Subtask> = new EventEmitter();
  @Output() selectionChangeEvent: EventEmitter<{ id: string; selected: boolean }> =
    new EventEmitter();

  showComments = signal(false);
  /** Inline expanded subtask comment blocks (by subtaskId) */
  expandedSubtaskCommentIds = signal<Set<string>>(new Set());
  private highlightedExpandedSubtaskId = signal<string | null>(null);

  /** Task as signal so computed can react to input changes */
  private taskForComments = signal<Task | null>(null);

  /** Task-only comments for the main comment panel */
  taskOnlyCommentsForPanel = computed(() => {
    const task = this.taskForComments();
    if (!task) return [];

    const taskComments = this.getActiveComments(task.comments);
    return taskComments;
  });

  /** Subtask rows (always available for list + inline expand) */
  subtaskCommentGroups = computed(() => {
    const task = this.taskForComments();
    if (!task) return [] as Array<{ subtaskId: string; title: string; comments: Comment[] }>;

    return (task.subtasks || [])
      .map((s: any) => ({
        subtaskId: s.id,
        title: s.title || "Untitled subtask",
        comments: this.getActiveComments(s.comments),
      }))
      .map((g) => ({ ...g, comments: g.comments }));
  });

  /** Total active comments (task + subtasks) used for the small badge near the comment icon */
  totalCommentsForBadge = computed(() => {
    const taskCount = this.taskOnlyCommentsForPanel().length;
    const subtaskCount = this.subtaskCommentGroups().reduce((sum, g) => sum + g.comments.length, 0);
    return taskCount + subtaskCount;
  });

  ngOnInit() {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes["task"]) {
      this.taskForComments.set(this.task ?? null);
    }
    if (changes["autoOpenComments"]?.currentValue === true) {
      this.showComments.set(true);
      this.cdr.markForCheck();
    }
    if (changes["highlightCommentId"]?.currentValue) {
      this.showComments.set(true);
      this.cdr.markForCheck();
    }
  }

  truncateString = Common.truncateString;

  get hasUnreadComments(): boolean {
    return this.unreadCommentsCount > 0;
  }

  get isBlocked(): boolean {
    return BaseItemHelper.isBlockedByDependencies(this.task?.dependsOn, this.allTasks);
  }

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

    // Mark subtask comments as read when opening (task's own comments are not counted in badge)
    if (!wasOpen && this.task && this.task.subtasks && this.task.subtasks.length > 0) {
      const userId = this.authService.getValueByKey("id");
      if (userId) {
        let hasUpdates = false;

        // Mark all subtask comments as read
        const updatedSubtasks = this.task.subtasks.map((subtask: any) => {
          if (!subtask.comments || subtask.comments.length === 0) return subtask;

          const updatedComments = subtask.comments.map((c: any) => {
            // Skip deleted comments and task comments (only subtask comments)
            if (c.deleted_at || !c.subtaskId) return c;
            // Skip if user is author (already read)
            if (c.authorId === userId) return c;

            // Mark as read if not already
            if (!c.readBy || !c.readBy.includes(userId)) {
              hasUpdates = true;
              return {
                ...c,
                readBy: [...(c.readBy || []), userId],
              };
            }
            return c;
          });

          return { ...subtask, comments: updatedComments };
        });

        if (hasUpdates) {
          // Update storage
          this.storageService.updateItem("tasks", this.task.id, {
            ...this.task,
            subtasks: updatedSubtasks,
          });

          // Send update to backend for subtask comments only
          const effectiveTodoId = this.todoId || this.task.todoId;
          if (effectiveTodoId) {
            const allSubtaskComments = updatedSubtasks.flatMap((s: any) =>
              (s.comments || []).filter(
                (c: any) => !c.deleted_at && c.subtaskId && c.authorId !== userId
              )
            );

            if (allSubtaskComments.length > 0) {
              this.dataSyncProvider
                .crud("updateAll", "comments", {
                  data: allSubtaskComments.map((c: any) => ({ id: c.id, readBy: c.readBy })),
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

  toggleInlineSubtaskComments(subtaskId: string) {
    this.expandedSubtaskCommentIds.update((set) => {
      const next = new Set(set);
      if (next.has(subtaskId)) next.delete(subtaskId);
      else next.add(subtaskId);
      return next;
    });
    this.highlightedExpandedSubtaskId.set(subtaskId);
    setTimeout(() => {
      if (this.highlightedExpandedSubtaskId() === subtaskId)
        this.highlightedExpandedSubtaskId.set(null);
    }, 1600);
    this.cdr.markForCheck();
  }

  isSubtaskExpanded(subtaskId: string): boolean {
    return this.expandedSubtaskCommentIds().has(subtaskId);
  }

  shouldHighlightExpandedSubtask(subtaskId: string): boolean {
    return this.highlightedExpandedSubtaskId() === subtaskId;
  }

  navigateToSubtaskComments(subtaskId: string) {
    if (!this.task) return;
    const effectiveTodoId = this.todoId || this.task.todoId;
    if (!effectiveTodoId) return;

    this.router.navigate(["/todos", effectiveTodoId, "tasks", this.task.id, "subtasks"], {
      queryParams: {
        highlightSubtask: subtaskId,
        openComments: true,
      },
    });
  }

  onAddComment(content: string) {
    if (this.task) {
      const userId = this.authService.getValueByKey("id");
      const username = this.authService.getValueByKey("username");
      const effectiveTodoId = this.todoId || this.task.todoId;

      if (!userId || !effectiveTodoId) {
        this.notifyService.showError("Cannot add comment: User or Project not found");
        return;
      }

      const commentForBackend: any = {
        authorId: userId,
        authorName: username || "Unknown",
        content: content,
        taskId: this.task.id,
        readBy: [userId],
        deleted_at: null,
      };

      this.dataSyncProvider
        .crud<Comment>("create", "comments", {
          data: commentForBackend,
          parentTodoId: effectiveTodoId,
        })
        .subscribe({
          next: () => {
            // DataSyncProvider auto-updates storage, just refresh UI
            this.showComments.set(true);
            this.cdr.markForCheck();
          },
          error: (err) => {
            this.notifyService.showError(err.message || "Failed to add comment");
          },
        });
    }
  }

  onAddSubtaskComment(subtaskId: string, content: string) {
    if (!this.task) return;
    const userId = this.authService.getValueByKey("id");
    const username = this.authService.getValueByKey("username");
    const effectiveTodoId = this.todoId || this.task.todoId;

    if (!userId || !effectiveTodoId) {
      this.notifyService.showError("Cannot add comment: User or Project not found");
      return;
    }

    const commentForBackend: any = {
      authorId: userId,
      authorName: username || "Unknown",
      content,
      subtaskId,
      readBy: [userId],
      deleted_at: null,
    };

    this.dataSyncProvider
      .crud<Comment>("create", "comments", {
        data: commentForBackend,
        parentTodoId: effectiveTodoId,
      })
      .subscribe({
        next: () => {
          this.showComments.set(true);
          this.expandedSubtaskCommentIds.update((set) => new Set(set).add(subtaskId));
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to add comment");
        },
      });
  }

  onDeleteComment(commentId: string) {
    const effectiveTodoId = this.todoId || this.task?.todoId;
    if (effectiveTodoId) {
      this.dataSyncProvider
        .crud("delete", "comments", { id: commentId, parentTodoId: effectiveTodoId })
        .subscribe({});
    }
  }

  onMarkAsRead(commentIds: string[]) {
    const userId = this.authService.getValueByKey("id");
    if (this.task && userId && commentIds.length > 0) {
      let changed = false;
      const updatedComments = (this.task.comments || []).map((c) => {
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
        this.updateTaskEvent.emit({
          task: this.task,
          field: "comments",
          value: updatedComments,
        });
      }
    }
  }

  onMarkSubtaskCommentsAsRead(subtaskId: string, commentIds: string[]) {
    const userId = this.authService.getValueByKey("id");
    const effectiveTodoId = this.todoId || this.task?.todoId;
    if (!this.task || !userId || !effectiveTodoId || commentIds.length === 0) return;

    let changed = false;
    const updatedSubtasks = (this.task.subtasks || []).map((s: any) => {
      if (s.id !== subtaskId) return s;
      const updatedComments = (s.comments || []).map((c: any) => {
        if (!commentIds.includes(c.id)) return c;
        const readBy = c.readBy || [];
        if (!readBy.includes(userId)) {
          changed = true;
          return { ...c, readBy: [...readBy, userId] };
        }
        return c;
      });
      return { ...s, comments: updatedComments };
    });

    if (!changed) return;

    this.storageService.updateItem("tasks", this.task.id, {
      ...this.task,
      subtasks: updatedSubtasks,
    });

    const commentsToUpdate = updatedSubtasks
      .find((s: any) => s.id === subtaskId)
      ?.comments?.filter(
        (c: any) => commentIds.includes(c.id) && !c.deleted_at && c.authorId !== userId
      );

    if (commentsToUpdate && commentsToUpdate.length > 0) {
      this.dataSyncProvider
        .crud("updateAll", "comments", {
          data: commentsToUpdate.map((c: any) => ({ id: c.id, readBy: c.readBy })),
          parentTodoId: effectiveTodoId,
        })
        .subscribe();
    }
  }

  toggleExpand() {
    if (this.task) {
      this.toggleSubtasksEvent.emit(this.task);
      this.cdr.markForCheck();
    }
  }

  onSelectionChange(checked: boolean): void {
    if (this.task) {
      this.selectionChangeEvent.emit({ id: this.task.id, selected: checked });
    }
  }

  onSubtaskToggleCompletion(subtask: Subtask) {
    this.toggleSubtaskCompletionEvent.emit(subtask);
  }

  getSubtaskPriorityColor = BaseItemHelper.getPriorityColor;

  getSubtaskStatusIcon = BaseItemHelper.getStatusIcon;

  getSubtaskStatusColor = BaseItemHelper.getStatusColor;

  get countCompletedSubtasks(): number {
    return BaseItemHelper.countCompleted(this.task?.subtasks ?? []);
  }

  get totalSubtasks(): number {
    return this.task?.subtasks?.length ?? 0;
  }

  getPriorityColor = BaseItemHelper.getPriorityBadgeClass;

  formatDate = BaseItemHelper.formatDate;

  toggleCompletion(event: any) {
    event.stopPropagation();
    if (this.task) {
      this.toggleCompletionEvent.emit(this.task);
      this.cdr.markForCheck();
    }
  }

  saveInlineEdit() {
    if (this.editingValue().trim() && this.editingField() && this.task) {
      const originalValue =
        this.editingField() === "title" ? this.task.title : this.task.description;
      if (this.editingValue().trim() !== originalValue) {
        this.updateTaskEvent.emit({
          task: this.task,
          field: this.editingField()!,
          value: this.editingValue().trim(),
        });
      }
    }
    this.cancelInlineEdit();
  }

  deleteTask() {
    if (this.task) {
      this.deleteTaskEvent.emit(this.task.id);
    }
  }
}
