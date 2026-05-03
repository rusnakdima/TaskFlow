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
  HostListener,
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
import { DateHelper } from "@helpers/date.helper";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { StorageService } from "@services/core/storage.service";
import { ApiProvider } from "@providers/api.provider";
import { NotifyService } from "@services/notifications/notify.service";
import { Router } from "@angular/router";

/* models */
import { Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Comment } from "@models/comment.model";
import { Todo } from "@models/todo.model";

interface CommentAction {
  user_id: string;
  content: string;
  task_id?: string;
  subtask_id?: string;
  read_by: string[];
  deleted_at: string | null;
}

interface SubtaskCommentGroup {
  subtask_id: string;
  title: string;
  comments: Comment[];
}

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
  private dataSyncProvider = inject(ApiProvider);
  private notifyService = inject(NotifyService);
  private router = inject(Router);

  @Input() isOwner: boolean = true;
  @Input() isPrivate: boolean = true;
  @Input() highlight: boolean = false;
  @Input() showActions: boolean = true;
  @Input() task: Task | null = null;
  @Input() todo_id: string | null = null;
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
  isMenuOpen = signal(false);
  /** Inline expanded subtask comment blocks (by subtaskId) */
  expandedSubtaskCommentIds = signal<Set<string>>(new Set());
  private highlightedExpandedSubtaskId = signal<string | null>(null);

  /** Task as signal so computed can react to input changes */
  private taskForComments = signal<Task | null>(null);

  todo = computed(() => {
    const id = this.todo_id || this.task?.todo_id;
    if (!id) return null;
    return this.storageService.getById("todos", id) as Todo | null;
  });

  /** Task-only comments for the main comment panel */
  taskOnlyCommentsForPanel = computed(() => {
    const task = this.taskForComments();
    if (!task) return [];

    return this.storageService.comments().filter((c) => c.task_id === task.id && !c.deleted_at);
  });

  /** Subtask rows (always available for list + inline expand) */
  subtaskCommentGroups = computed(() => {
    const task = this.taskForComments();
    if (!task) return [] as SubtaskCommentGroup[];

    const subtasks = this.storageService
      .subtasks()
      .filter((s) => s.task_id === task.id && !s.deleted_at);

    return subtasks.map((s) => {
      const subtaskComments = this.storageService
        .comments()
        .filter((c) => c.subtask_id === s.id && !c.deleted_at);
      return {
        subtask_id: s.id,
        title: s.title || "Untitled subtask",
        comments: subtaskComments,
      };
    });
  });

  /** Total active comments (task + subtasks) used for the small badge near the comment icon */
  totalCommentsForBadge = computed(() => {
    const taskCount = this.taskOnlyCommentsForPanel().length;
    const subtaskCount = this.subtaskCommentGroups().reduce(
      (sum: number, g) => sum + g.comments.length,
      0
    );
    return taskCount + subtaskCount;
  });

  /** Get subtasks for a task from flat storage */
  getTaskSubtasks(taskId: string): Subtask[] {
    return this.storageService.subtasks().filter((s) => s.task_id === taskId && !s.deleted_at);
  }

  ngOnInit() {}

  @HostListener("document:click", ["$event"])
  onDocumentClick(event: Event) {
    const target = event.target as HTMLElement;
    if (this.isMenuOpen() && !target.closest(".task-menu")) {
      this.closeMenu();
    }
  }

  toggleMenu(event: any) {
    event.stopPropagation();
    this.isMenuOpen.update((v) => !v);
    this.cdr.markForCheck();
  }

  closeMenu() {
    if (this.isMenuOpen()) {
      this.isMenuOpen.set(false);
      this.cdr.markForCheck();
    }
  }

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
    return BaseItemHelper.isBlockedByDependencies(this.task?.depends_on, this.allTasks);
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

    if (!wasOpen && this.task) {
      const taskId = this.task.id;
      const userId = this.authService.getValueByKey("id");
      if (userId) {
        const subtaskIds = this.storageService
          .subtasks()
          .filter((s) => s.task_id === taskId && !s.deleted_at)
          .map((s) => s.id);

        const subtaskComments = this.storageService
          .comments()
          .filter((c) => c.subtask_id && subtaskIds.includes(c.subtask_id) && !c.deleted_at);

        const commentsToUpdate = subtaskComments.filter(
          (c) => c.user_id !== userId && (!c.read_by || !c.read_by.includes(userId))
        );

        if (commentsToUpdate.length > 0) {
          const effectiveTodoId = this.todo_id || this.task.todo_id;
          commentsToUpdate.forEach((c) => {
            this.storageService.updateItem("comments", c.id, {
              read_by: [...(c.read_by || []), userId],
            });
          });

          if (effectiveTodoId) {
            this.dataSyncProvider
              .crud("updateAll", "comments", {
                data: commentsToUpdate.map((c) => ({ id: c.id, read_by: c.read_by })),
                parentTodoId: effectiveTodoId,
              })
              .subscribe();
          }
        }
      }
    }

    this.cdr.markForCheck();
  }

  toggleInlineSubtaskComments(subtask_id: string) {
    this.expandedSubtaskCommentIds.update((set) => {
      const next = new Set(set);
      if (next.has(subtask_id)) next.delete(subtask_id);
      else next.add(subtask_id);
      return next;
    });
    this.highlightedExpandedSubtaskId.set(subtask_id);
    setTimeout(() => {
      if (this.highlightedExpandedSubtaskId() === subtask_id)
        this.highlightedExpandedSubtaskId.set(null);
    }, 1600);
    this.cdr.markForCheck();
  }

  isSubtaskExpanded(subtask_id: string): boolean {
    return this.expandedSubtaskCommentIds().has(subtask_id);
  }

  shouldHighlightExpandedSubtask(subtask_id: string): boolean {
    return this.highlightedExpandedSubtaskId() === subtask_id;
  }

  navigateToSubtaskComments(subtask_id: string) {
    if (!this.task) return;
    const effectiveTodoId = this.todo_id || this.task.todo_id;
    if (!effectiveTodoId) return;

    this.router.navigate(["/todos", effectiveTodoId, "tasks", this.task.id, "subtasks"], {
      queryParams: {
        highlightSubtask: subtask_id,
        openComments: true,
      },
    });
  }

  onAddComment(content: string) {
    if (this.task) {
      const userId = this.authService.getValueByKey("id");
      const effectiveTodoId = this.todo_id || this.task.todo_id;

      if (!userId || !effectiveTodoId) {
        this.notifyService.showError("Cannot add comment: User or Project not found");
        return;
      }

      const commentForBackend: CommentAction = {
        user_id: userId,
        content: content,
        task_id: this.task.id,
        read_by: [userId],
        deleted_at: null,
      };

      this.dataSyncProvider
        .crud<Comment>("create", "comments", {
          data: commentForBackend,
          parentTodoId: effectiveTodoId,
          visibility: this.isPrivate ? "private" : "shared",
        })
        .subscribe({
          next: () => {
            this.showComments.set(true);
            this.cdr.markForCheck();
          },
          error: (err: Error) => {
            this.notifyService.showError(err.message || "Failed to add comment");
          },
        });
    }
  }

  onAddSubtaskComment(content: string, subtask_id?: string) {
    if (!this.task) return;
    const userId = this.authService.getValueByKey("id");
    const effectiveTodoId = this.todo_id || this.task.todo_id;

    if (!userId || !effectiveTodoId) {
      this.notifyService.showError("Cannot add comment: User or Project not found");
      return;
    }

    const commentForBackend: CommentAction = {
      user_id: userId,
      content,
      subtask_id: subtask_id,
      read_by: [userId],
      deleted_at: null,
    };

    this.dataSyncProvider
      .crud<Comment>("create", "comments", {
        data: commentForBackend,
        parentTodoId: effectiveTodoId,
        visibility: this.isPrivate ? "private" : "shared",
      })
      .subscribe({
        next: () => {
          this.showComments.set(true);
          this.expandedSubtaskCommentIds.update((set) => new Set(set).add(subtask_id!));
          this.cdr.markForCheck();
        },
        error: (err: Error) => {
          this.notifyService.showError(err.message || "Failed to add comment");
        },
      });
  }

  onDeleteComment(commentId: string) {
    const effectiveTodoId = this.todo_id || this.task?.todo_id;
    if (effectiveTodoId) {
      this.dataSyncProvider
        .crud("delete", "comments", { id: commentId, parentTodoId: effectiveTodoId })
        .subscribe({
          error: (err) => {},
        });
    }
  }

  onMarkAsRead(commentIds: string[]) {
    const userId = this.authService.getValueByKey("id");
    if (this.task && userId && commentIds.length > 0) {
      const taskId = this.task.id;
      const taskComments = this.storageService
        .comments()
        .filter((c) => c.task_id === taskId && commentIds.includes(c.id) && !c.deleted_at);

      const commentsToUpdate = taskComments.filter((c) => !c.read_by?.includes(userId));

      if (commentsToUpdate.length > 0) {
        commentsToUpdate.forEach((c) => {
          this.storageService.updateItem("comments", c.id, {
            read_by: [...(c.read_by || []), userId],
          });
        });

        const effectiveTodoId = this.todo_id || this.task.todo_id;
        if (effectiveTodoId) {
          this.dataSyncProvider
            .crud("updateAll", "comments", {
              data: commentsToUpdate.map((c) => ({ id: c.id, read_by: c.read_by })),
              parentTodoId: effectiveTodoId,
            })
            .subscribe();
        }
      }
    }
  }

  onMarkSubtaskCommentsAsRead(commentIds: string[], subtask_id?: string) {
    const userId = this.authService.getValueByKey("id");
    const effectiveTodoId = this.todo_id || this.task?.todo_id;
    if (!this.task || !userId || !effectiveTodoId || commentIds.length === 0) return;

    const commentsToUpdate = this.storageService
      .comments()
      .filter((c) => c.subtask_id === subtask_id && commentIds.includes(c.id) && !c.deleted_at);

    if (commentsToUpdate.length === 0) return;

    commentsToUpdate.forEach((c) => {
      this.storageService.updateItem("comments", c.id, {
        read_by: [...(c.read_by || []), userId],
      });
    });

    this.dataSyncProvider
      .crud("updateAll", "comments", {
        data: commentsToUpdate.map((c) => ({ id: c.id, read_by: c.read_by })),
        parentTodoId: effectiveTodoId,
      })
      .subscribe();
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
    const taskId = this.task?.id;
    if (!taskId) return 0;
    return this.storageService
      .subtasks()
      .filter((s) => s.task_id === taskId && !s.deleted_at && s.status === "completed").length;
  }

  get totalSubtasks(): number {
    const taskId = this.task?.id;
    if (!taskId) return 0;
    return this.storageService.subtasks().filter((s) => s.task_id === taskId && !s.deleted_at)
      .length;
  }

  getPriorityColor = BaseItemHelper.getPriorityBadgeClass;

  formatDate = DateHelper.formatDateShort;

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
