/* sys lib */
import { CommonModule } from "@angular/common";
import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  inject,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { DragDropModule } from "@angular/cdk/drag-drop";

/* components */
import { CommentsComponent } from "@components/comments/comments.component";
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";
import { SubtaskCommentGroup } from "@components/subtask-comments-list/subtask-comments-list.component";

/* helpers */
import { BaseItemHelper } from "@helpers/base-item.helper";

/* base */
import { ItemRowBaseComponent } from "@components/item-row-base/item-row-base.component";

/* models */
import { Comment } from "@models/comment.model";
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";

@Component({
  selector: "app-task-table-row",
  standalone: true,
  imports: [CommonModule, MatIconModule, DragDropModule, CommentsComponent, CheckboxComponent],
  templateUrl: "./task-table-row.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskTableRowComponent extends ItemRowBaseComponent {
  @Input() task: Task | null = null;
  @Input() override todo: Todo | null = null;
  @Output() override toggleExpandEvent = new EventEmitter<Task>();
  @Output() override toggleSubtaskCompletionEvent = new EventEmitter<Subtask>();
  @Output() override addSubtaskCommentEvent = new EventEmitter<{
    content: string;
    subtask_id: string;
  }>();

  private cdr = inject(ChangeDetectorRef);

  override get item(): Task | null {
    return this.task;
  }

  override get itemId(): string {
    return this.task?.id || "";
  }

  override get itemTitle(): string {
    return this.task?.title || "";
  }

  override get itemDescription(): string | null {
    return this.task?.description || null;
  }

  override get itemStatus(): string {
    return this.task?.status || "";
  }

  override get itemPriority(): string {
    return this.task?.priority || "";
  }

  override get itemComments(): Comment[] {
    if (!this.task?.comments) return [];
    return this.task.comments.filter((c) => !c.deleted_at);
  }

  override get itemSubtasks(): Subtask[] {
    return this.task?.subtasks || [];
  }

  override get subtaskCount(): number {
    return this.itemSubtasks.length;
  }

  override get itemDeleteEvent(): EventEmitter<string> {
    return new EventEmitter<string>();
  }

  override get addCommentEvent(): EventEmitter<{
    content: string;
    task_id?: string;
    subtask_id?: string;
  }> {
    return new EventEmitter<{ content: string; task_id?: string; subtask_id?: string }>();
  }

  get subtaskCommentGroups(): SubtaskCommentGroup[] {
    if (!this.task?.subtasks) return [];
    return this.task.subtasks.map((s) => ({
      subtask_id: s.id,
      title: s.title || "Untitled subtask",
      comments: (s.comments || []).filter((c: Comment) => !c.deleted_at),
    }));
  }

  toggleExpand() {
    if (this.task) {
      this.toggleExpandEvent.emit(this.task);
    }
  }

  toggleSubtaskCompletion(subtask: Subtask) {
    this.toggleSubtaskCompletionEvent.emit(subtask);
  }

  onAddSubtaskComment(event: { content: string; subtask_id: string }) {
    this.addSubtaskCommentEvent.emit(event);
  }

  override onAddComment(content: string): void {
    if (this.task) {
      this.addCommentEvent.emit({ content, task_id: this.task.id });
    }
  }
}
