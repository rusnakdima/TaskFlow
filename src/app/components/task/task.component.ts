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
import { ProgressBarComponent } from "@components/progress-bar/progress-bar.component";
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

/* helpers */
import { Common } from "@helpers/common.helper";
import { BaseItemHelper } from "@helpers/base-item.helper";
import { DateHelper } from "@helpers/date.helper";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { StorageService } from "@services/storage.service";
import { NotifyService } from "@services/notifications/notify.service";
import { Router } from "@angular/router";
import { CommentService } from "@services/features/comment.service";
import { GithubService } from "@services/github/github.service";
import { REQUEST_SERVICE } from "@services/api.service";

/* models */
import {
  PRIORITY_COLORS,
  PRIORITY_ICONS,
  STATUS_BUTTON_COLORS,
  STATUS_BUTTON_ICONS,
  ActionColors,
} from "@constants/table-field.constants";
import { Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Comment } from "@models/comment.model";
import { Todo } from "@models/todo.model";
import { SubtaskCommentGroup } from "@components/subtask-comments-list/subtask-comments-list.component";

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
  private notifyService = inject(NotifyService);
  private router = inject(Router);
  private commentService = inject(CommentService);
  private githubService = inject(GithubService);
  private requestService = inject(REQUEST_SERVICE);
  private destroyRef = inject(DestroyRef);

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
  @Output() addSubtaskCommentEvent: EventEmitter<{ content: string; subtask_id: string }> =
    new EventEmitter();
  @Output() cardClick = new EventEmitter<{ event: MouseEvent; id: string }>();

  showComments = signal(false);
  creatingGithubIssue = signal(false);
  loadingTaskComments = signal(false);

  private commentsSignal = signal<Comment[]>([]);
  private subtasksSignal = signal<Subtask[]>([]);

  private commentsEffect = effect(() => {
    this.commentsSignal.set(this.storageService.comments());
  });

  private subtasksEffect = effect(() => {
    this.subtasksSignal.set(this.storageService.subtasks());
  });

  expandedSubtaskCommentIds = signal<Set<string>>(new Set());
  private highlightedExpandedSubtaskId = signal<string | null>(null);

  get menuClass(): string {
    return "task-menu";
  }

  getStatusBgColor(status: string): string {
    return STATUS_BUTTON_COLORS[status as TaskStatus] || STATUS_BUTTON_COLORS[TaskStatus.PENDING];
  }

  getStatusIcon(status: string): string {
    return STATUS_BUTTON_ICONS[status as TaskStatus] || STATUS_BUTTON_ICONS[TaskStatus.PENDING];
  }

  getPriorityBgColor(priority: string): string {
    return PRIORITY_COLORS[priority as keyof typeof PRIORITY_COLORS] || PRIORITY_COLORS.low;
  }

  getPriorityIcon(priority: string): string {
    return PRIORITY_ICONS[priority as keyof typeof PRIORITY_ICONS] || "keyboard_arrow_down";
  }

  getActionColor(action: string): string {
    const colorKey = action as keyof typeof ActionColors;
    const baseClass = "rounded-lg p-2 transition-colors";
    return `${baseClass} ${ActionColors[colorKey] || ActionColors.default}`;
  }

  private taskForComments = signal<Task | null>(null);

  todo = computed<Todo | null>(() => {
    const todoId = this.todo_id || this.task?.todo_id;
    if (!todoId) return null;
    const found = this.storageService.todos().find((t) => t.id === todoId);
    return found ?? null;
  });

  ngOnInit() {}

  private comments = computed(() => this.commentsSignal());
  private subtasks = computed(() => this.subtasksSignal());

  taskOnlyCommentsForPanel = computed(() => {
    const task = this.taskForComments();
    if (!task) return [];

    return this.comments().filter((c: Comment) => c.task_id === task.id && !c.deleted_at);
  });

  subtaskCommentGroups = computed((): SubtaskCommentGroup[] => {
    const task = this.taskForComments();
    if (!task) return [] as SubtaskCommentGroup[];

    const taskSubtasks = this.subtasks().filter(
      (s: Subtask) => s.task_id === task.id && !s.deleted_at
    );

    return taskSubtasks.map((s: Subtask) => {
      const subtaskComments = this.comments().filter(
        (c: Comment) => c.subtask_id === s.id && !c.deleted_at
      );
      return {
        subtask_id: s.id,
        title: s.title || "Untitled subtask",
        comments: subtaskComments,
      };
    });
  });

  totalCommentsForBadge = computed(() => {
    const taskCount = this.taskOnlyCommentsForPanel().length;
    const subtaskCount = this.subtaskCommentGroups().reduce(
      (sum: number, g: SubtaskCommentGroup) => sum + g.comments.length,
      0
    );
    return taskCount + subtaskCount;
  });

  getTaskSubtasks(taskId: string): Subtask[] {
    return this.subtasks().filter((s: Subtask) => s.task_id === taskId && !s.deleted_at);
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

  getActiveComments(comments: Comment[] | undefined): Comment[] {
    if (!comments || comments.length === 0) return [];
    return comments.filter((c: Comment) => !c.deleted_at);
  }

  toggleComments() {
    const wasOpen = this.showComments();
    this.showComments.update((v) => !v);

    if (!wasOpen && this.task) {
      const visibility = this.isPrivate ? "private" : "shared";
      const taskId = this.task.id;
      const task = this.task;

      this.requestService
        .loadPage("comments", { filter: { task_id: taskId }, visibility, skip: 0, limit: 20 })
        .subscribe({
          next: () => {
            this.requestService
              .loadPage("subtasks", { filter: { task_id: taskId }, visibility, skip: 0, limit: 20 })
              .subscribe();

            const userId = this.authService.getValueByKey("id");
            if (userId) {
              const subtaskIds = this.subtasks()
                .filter((s: Subtask) => s.task_id === taskId && !s.deleted_at)
                .map((s: Subtask) => s.id);

              const subtaskComments = this.comments().filter(
                (c: Comment) => c.subtask_id && subtaskIds.includes(c.subtask_id) && !c.deleted_at
              );

              const commentsToUpdate = subtaskComments.filter(
                (c: Comment) => c.user_id !== userId && (!c.read_by || !c.read_by.includes(userId))
              );

              if (commentsToUpdate.length > 0) {
                const effectiveTodoId = this.todo_id || task.todo_id;

                const localUpdates = commentsToUpdate.map((c: Comment) => ({
                  ...c,
                  read_by: [...(c.read_by || []), userId],
                }));

                if (effectiveTodoId) {
                  this.requestService
                    .updateAll(
                      "comments",
                      localUpdates.map((c: Comment) => ({ id: c.id, read_by: c.read_by }))
                    )
                    .pipe(takeUntilDestroyed(this.destroyRef))
                    .subscribe({
                      next: () => {},
                      error: (err: Error) => {
                        console.error("Mark comments read failed:", err);
                      },
                    });
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
    if (!this.task) {
      console.warn("onAddComment: this.task is null, returning early. taskId:", this.todo_id);
      return;
    }
    const effectiveTodoId = this.todo_id || this.task.todo_id;
    if (!effectiveTodoId) {
      console.warn(
        "onAddComment: effectiveTodoId is null. todo_id:",
        this.todo_id,
        "task.todo_id:",
        this.task?.todo_id
      );
      this.notifyService.showError("Cannot add comment: User or Project not found");
      return;
    }

    this.commentService
      .createComment(content, effectiveTodoId, {
        taskId: this.task.id,
        visibility: this.isPrivate ? "private" : "shared",
      })
      .subscribe({
        next: () => {
          this.showComments.set(true);
          this.cdr.markForCheck();
        },
        error: (err: Error) => {
          console.error("onAddComment: createComment error:", err);
          this.notifyService.showError(err.message || "Failed to add comment");
        },
      });
  }

  onAddSubtaskComment(content: string, subtask_id?: string) {
    if (!this.task) return;
    const effectiveTodoId = this.todo_id || this.task.todo_id;
    if (!effectiveTodoId) {
      this.notifyService.showError("Cannot add comment: User or Project not found");
      return;
    }

    this.commentService
      .createComment(content, effectiveTodoId, {
        subtaskId: subtask_id,
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
      this.requestService
        .delete("comments", commentId, { visibility: this.isPrivate ? "private" : "shared" })
        .subscribe({
          error: (err: Error) => {},
        });
    }
  }

  onMarkAsRead(commentIds: string[]) {
    const userId = this.authService.getValueByKey("id");
    const effectiveTodoId = this.todo_id || this.task?.todo_id;
    if (!this.task || !userId || commentIds.length === 0) return;

    this.commentService.markCommentsAsRead(commentIds, userId, effectiveTodoId || "");
  }

  onLoadMoreTaskComments() {
    if (!this.task || this.loadingTaskComments()) return;
    const visibility = this.isPrivate ? "private" : "shared";
    this.loadingTaskComments.set(true);
    this.requestService.loadMore("comments").subscribe({
      next: () => {
        this.loadingTaskComments.set(false);
        this.cdr.markForCheck();
      },
      error: () => {
        this.loadingTaskComments.set(false);
        this.notifyService.showError("Failed to load more comments");
      },
    });
  }

  onMarkSubtaskCommentsAsRead(commentIds: string[], subtask_id?: string) {
    const userId = this.authService.getValueByKey("id");
    const effectiveTodoId = this.todo_id || this.task?.todo_id;
    if (!this.task || !userId || !effectiveTodoId || commentIds.length === 0) return;

    this.commentService.markCommentsAsRead(commentIds, userId, effectiveTodoId);
  }

  toggleExpand() {
    if (this.task) {
      this.toggleSubtasksEvent.emit(this.task);
      this.cdr.markForCheck();
    }
  }

  onSelectionChange(result: { checked: boolean; event?: MouseEvent }): void {
    if (this.task) {
      this.selectionChangeEvent.emit({ id: this.task.id, selected: result.checked });
    }
  }

  onCardClick(event: MouseEvent): void {
    if (this.task) {
      this.cardClick.emit({ event, id: this.task.id });
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
    return this.subtasks().filter(
      (s: Subtask) => s.task_id === taskId && !s.deleted_at && s.status === "completed"
    ).length;
  }

  get totalSubtasks(): number {
    const taskId = this.task?.id;
    if (!taskId) return 0;
    return this.subtasks().filter((s: Subtask) => s.task_id === taskId && !s.deleted_at).length;
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

  get item() {
    return this.task;
  }

  get updateEvent() {
    return this.updateTaskEvent;
  }

  deleteTask() {
    if (this.task) {
      this.deleteTaskEvent.emit(this.task.id);
    }
  }

  hasGithubIssue = computed(() => !!this.task?.github_issue_id);

  createOrUpdateGithubIssue() {
    if (!this.task) return;
    const todo = this.todo();
    if (!todo || !todo.github_repo_id || !todo.github_repo_name) {
      this.notifyService.showError("Project is not linked to a GitHub repository");
      return;
    }

    this.creatingGithubIssue.set(true);
    const [owner, repo] = todo.github_repo_name.split("/");
    if (!owner || !repo) {
      this.notifyService.showError("Invalid GitHub repository configuration");
      this.creatingGithubIssue.set(false);
      return;
    }

    const issueBody = `**Task Details**

**Description:** ${this.task.description || "N/A"}
**Priority:** ${this.task.priority || "medium"}
**Due Date:** ${this.task.end_date || "N/A"}
**Created in:** TaskFlow

---
[View in TaskFlow](taskflow://tasks/${this.task.id})`;

    if (this.hasGithubIssue()) {
      this.githubService
        .updateIssue(owner, repo, this.task.github_issue_number!, this.task.title, issueBody)
        .subscribe({
          next: (result) => {
            this.updateTaskEvent.emit({
              task: this.task!,
              field: "github_issue_url",
              value: result.html_url,
            });
            this.creatingGithubIssue.set(false);
          },
          error: (err) => {
            this.notifyService.showError("Failed to update GitHub issue: " + (err.message || err));
            this.creatingGithubIssue.set(false);
          },
        });
    } else if (this.task.publish_to_github) {
      this.githubService.createIssue(owner, repo, this.task.title, issueBody).subscribe({
        next: (result) => {
          this.updateTaskEvent.emit({
            task: this.task!,
            field: "github_issue_id",
            value: String(result.id),
          });
          this.updateTaskEvent.emit({
            task: this.task!,
            field: "github_issue_number",
            value: result.number,
          });
          this.updateTaskEvent.emit({
            task: this.task!,
            field: "github_issue_url",
            value: result.html_url,
          });
          this.creatingGithubIssue.set(false);
        },
        error: (err) => {
          this.notifyService.showError("Failed to create GitHub issue: " + (err.message || err));
          this.creatingGithubIssue.set(false);
        },
      });
    } else {
      this.creatingGithubIssue.set(false);
    }
  }
}
