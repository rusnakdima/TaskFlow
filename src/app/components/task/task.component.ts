/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, OnInit, Output, signal, inject } from "@angular/core";
import { RouterModule } from "@angular/router";
import { FormsModule } from "@angular/forms";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { DragDropModule } from "@angular/cdk/drag-drop";

/* components */
import { CommentsComponent } from "@components/comments/comments.component";

/* helpers */
import { Common } from "@helpers/common.helper";
import { BaseItemHelper } from "@helpers/base-item.helper";

/* services */
import { AuthService } from "@services/auth.service";

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
  ],
  templateUrl: "./task.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskComponent implements OnInit {
  private baseHelper = inject(BaseItemHelper);
  private authService = inject(AuthService);

  @Input() task: Task | null = null;
  @Input() index: number = 0;
  @Input() isOwner: boolean = true;
  @Input() isPrivate: boolean = true;
  @Input() highlight: boolean = false;
  @Input() isExpanded: boolean = false;
  @Input() isSelected: boolean = false;
  @Input() allTasks: Task[] = [];
  @Input() showExpandButton: boolean = false;

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

  truncateString = Common.truncateString;

  get hasUnreadComments(): boolean {
    if (!this.task || !this.task.comments) return false;
    const userId = this.authService.getValueByKey("id");
    if (!userId) return false;
    return this.task.comments.some((c) => !c.readBy || !c.readBy.includes(userId));
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

      const updatedComments = [...(this.task.comments || []), newComment];
      this.updateTaskEvent.emit({
        task: this.task,
        field: "comments",
        value: updatedComments,
      });
    }
  }

  onDeleteComment(commentId: string) {
    if (this.task) {
      const updatedComments = (this.task.comments || []).filter((c) => c.id !== commentId);
      this.updateTaskEvent.emit({
        task: this.task,
        field: "comments",
        value: updatedComments,
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

  get countCompletedTasks(): number {
    return this.baseHelper.countCompleted(this.task?.subtasks ?? []);
  }

  get countTasks(): number {
    return this.task?.subtasks?.length ?? 0;
  }

  get percentCompletedSubTasks(): number {
    const completed = this.baseHelper.countCompleted(this.task?.subtasks ?? []);
    const total = this.task?.subtasks?.length ?? 0;
    return completed / (total === 0 ? 1 : total);
  }

  getProgressPercentage(): number {
    if (this.task?.status === TaskStatus.COMPLETED || this.task?.status === TaskStatus.SKIPPED)
      return 100;
    return Math.round(this.percentCompletedSubTasks * 100);
  }

  getProgressSegments = () => this.baseHelper.getProgressSegments(this.task?.subtasks ?? []);

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
