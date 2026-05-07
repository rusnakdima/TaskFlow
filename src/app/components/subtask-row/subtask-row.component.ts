/* sys lib */
import { CommonModule } from "@angular/common";
import {
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
  ChangeDetectionStrategy,
} from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { DragDropModule } from "@angular/cdk/drag-drop";

/* components */
import { CommentsComponent } from "@components/comments/comments.component";
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

/* helpers */
import { BaseItemHelper } from "@helpers/base-item.helper";

/* base */
import { ItemRowBaseComponent } from "@components/item-row-base/item-row-base.component";

/* models */
import { STATUS_BUTTON_COLORS, STATUS_BUTTON_ICONS } from "@constants/table-field.constants";
import { Comment } from "@models/comment.model";
import { Todo } from "@models/todo.model";
import { Subtask } from "@models/subtask.model";

@Component({
  selector: "app-subtask-row",
  standalone: true,
  imports: [CommonModule, MatIconModule, DragDropModule, CommentsComponent, CheckboxComponent],
  templateUrl: "./subtask-row.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubtaskRowComponent extends ItemRowBaseComponent {
  @Input() subtask: Subtask | null = null;
  @Input() override todo: Todo | null = null;
  @Output() override toggleCompletionEvent = new EventEmitter<Subtask>();

  override get item(): Subtask | null {
    return this.subtask;
  }

  override get type(): "subtask" {
    return "subtask";
  }

  override get itemId(): string {
    return this.subtask?.id || "";
  }

  override get itemTitle(): string {
    return this.subtask?.title || "";
  }

  override get itemDescription(): string | null {
    return this.subtask?.description || null;
  }

  override get itemStatus(): string {
    return this.subtask?.status || "";
  }

  override get itemPriority(): string {
    return this.subtask?.priority || "";
  }

  override get itemComments(): Comment[] {
    if (!this.subtask?.comments) return [];
    return this.subtask.comments.filter((c) => !c.deleted_at);
  }

  override get itemSubtasks(): any[] {
    return [];
  }

  override get subtaskCount(): number {
    return 0;
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

  toggleCompletion() {
    if (this.subtask) {
      this.toggleCompletionEvent.emit(this.subtask);
    }
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

  override onAddComment(content: string): void {
    if (this.subtask) {
      this.addCommentEvent.emit({ content, subtask_id: this.subtask.id });
    }
  }
}
