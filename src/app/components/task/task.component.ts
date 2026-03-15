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
} from "@angular/core";
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

/* models */
import { Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Comment } from "@models/comment.model";

import { ChangeDetectionStrategy, ChangeDetectorRef } from "@angular/core";

@Component({
  selector: "app-task",
  standalone: true,
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
export class TaskComponent implements OnInit, OnChanges {
  private baseHelper = new BaseItemHelper();
  private authService = inject(AuthService);
  private storageService = inject(StorageService);
  private dataSyncProvider = inject(DataSyncProvider);
  private notifyService = inject(NotifyService);
  private cdr = inject(ChangeDetectorRef);

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
  @Output() edit = new EventEmitter<void>();
  @Output() delete = new EventEmitter<void>();
  @Output() toggle = new EventEmitter<void>();

  editingField = signal<string | null>(null);
  editingValue = signal("");
  showComments = signal(false);

  ngOnInit() {}

  ngOnChanges(changes: SimpleChanges) {
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
    return this.baseHelper.isBlockedByDependencies(this.task?.dependsOn, this.allTasks);
  }

  /**
   * Filter out deleted comments
   */
  getActiveComments(comments: Comment[] | undefined): Comment[] {
    if (!comments || comments.length === 0) return [];
    return comments.filter((c) => !c.isDeleted);
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
            if (c.isDeleted || !c.subtaskId) return c;
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
                (c: any) => !c.isDeleted && c.subtaskId && c.authorId !== userId
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
        readBy: [userId], // Creator has already read it
        isDeleted: false,
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

  getSubtaskPriorityColor = this.baseHelper.getPriorityColor;

  getSubtaskStatusIcon = this.baseHelper.getStatusIcon;

  getSubtaskStatusColor = this.baseHelper.getStatusColor;

  get countCompletedSubtasks(): number {
    return this.baseHelper.countCompleted(this.task?.subtasks ?? []);
  }

  get totalSubtasks(): number {
    return this.task?.subtasks?.length ?? 0;
  }

  getPriorityColor = this.baseHelper.getPriorityBadgeClass;

  formatDate = this.baseHelper.formatDate;

  toggleCompletion(event: any) {
    event.stopPropagation();
    if (this.task) {
      this.toggleCompletionEvent.emit(this.task);
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

  cancelInlineEdit() {
    this.editingField.set(null);
    this.editingValue.set("");
    this.cdr.markForCheck();
  }

  deleteTask() {
    if (this.task) {
      this.deleteTaskEvent.emit(this.task.id);
    }
  }

  onEditClick(): void {
    this.edit.emit();
  }

  onDeleteClick(): void {
    this.delete.emit();
  }

  onToggleClick(): void {
    this.toggle.emit();
  }
}
