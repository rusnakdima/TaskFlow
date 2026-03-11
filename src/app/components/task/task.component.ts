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

/* helpers */
import { Common } from "@helpers/common.helper";
import { BaseItemHelper } from "@helpers/base-item.helper";

/* services */
import { AuthService } from "@services/auth.service";
import { StorageService } from "@services/storage.service";
import { DataSyncProvider } from "@providers/data-sync.provider";

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
  ],
  templateUrl: "./task.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskComponent implements OnInit, OnChanges {
  private baseHelper = inject(BaseItemHelper);
  private authService = inject(AuthService);
  private storageService = inject(StorageService);
  private dataSyncProvider = inject(DataSyncProvider);

  @Input() task: Task | null = null;
  @Input() todoId: string | null = null;
  @Input() index: number = 0;
  @Input() isOwner: boolean = true;
  @Input() isPrivate: boolean = true;
  @Input() highlight: boolean = false;
  @Input() isExpanded: boolean = false;
  @Input() isSelected: boolean = false;
  @Input() allTasks: Task[] = [];
  @Input() showExpandButton: boolean = false;
  @Input() highlightCommentId: string | null = null;
  @Input() autoOpenComments: boolean = false;

  @Output() deleteTaskEvent: EventEmitter<string> = new EventEmitter();
  @Output() toggleCompletionEvent: EventEmitter<Task> = new EventEmitter();
  @Output() updateTaskEvent: EventEmitter<{ task: Task; field: string; value: any }> =
    new EventEmitter();
  @Output() toggleSubtasksEvent: EventEmitter<Task> = new EventEmitter();
  @Output() toggleSubtaskCompletionEvent: EventEmitter<Subtask> = new EventEmitter();
  @Output() selectionChangeEvent: EventEmitter<string> = new EventEmitter();

  editingField = signal<string | null>(null);
  editingValue = signal("");
  showComments = signal(false);

  constructor(private cdr: ChangeDetectorRef) {}

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

  get unreadCommentsCount(): number {
    return this.baseHelper.countUnreadComments(
      this.task,
      this.authService.getValueByKey("id"),
      "task"
    );
  }

  get hasUnreadComments(): boolean {
    return this.unreadCommentsCount > 0;
  }

  get isBlocked(): boolean {
    return this.baseHelper.isBlockedByDependencies(this.task?.dependsOn, this.allTasks);
  }

  toggleComments() {
    this.showComments.update((v) => !v);
    this.cdr.markForCheck();
  }

  onAddComment(content: string) {
    const userId = this.authService.getValueByKey("id");
    const username = this.authService.getValueByKey("username");

    if (this.task && userId) {
      // Get todoId from input or from task
      const effectiveTodoId = this.todoId || this.task.todoId;
      if (!effectiveTodoId) {
        console.error("Cannot add comment: todoId not found");
        return;
      }

      const newComment: Comment = {
        id: crypto.randomUUID(),
        authorId: userId,
        authorName: username || "Unknown",
        content: content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        taskId: this.task.id,
        readBy: [userId],
      };

      // Create comment as separate document (not embedded)
      // WebSocket will broadcast the event and update storage automatically
      this.dataSyncProvider
        .create<Comment>("comments", newComment, undefined, effectiveTodoId)
        .subscribe({
          next: () => {
            this.showComments.set(true);
            this.cdr.markForCheck();
          },
          error: (err) => {
            console.error("Failed to create comment:", err);
          },
        });
    }
  }

  onDeleteComment(commentId: string) {
    if (this.task) {
      // Get todoId from input or from task
      const effectiveTodoId = this.todoId || this.task.todoId;
      if (!effectiveTodoId) {
        console.error("Cannot delete comment: todoId not found");
        return;
      }

      // Delete comment as separate document
      // WebSocket will broadcast the event and update storage automatically
      this.dataSyncProvider.delete("comments", commentId, undefined, effectiveTodoId).subscribe({
        error: (err) => {
          console.error("Failed to delete comment:", err);
        },
      });
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

  onSelectionChange(): void {
    if (this.task) {
      this.selectionChangeEvent.emit(this.task.id);
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
}
