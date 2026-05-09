/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { DragDropModule } from "@angular/cdk/drag-drop";

/* components */
import { CommentsComponent } from "@components/comments/comments.component";
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

/* helpers */
import { BaseItemHelper } from "@helpers/base-item.helper";
import { getActionColor } from "@helpers/action-color.helper";

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
  protected readonly BaseItemHelper = BaseItemHelper;
  protected readonly STATUS_BUTTON_COLORS = STATUS_BUTTON_COLORS;
  protected readonly STATUS_BUTTON_ICONS = STATUS_BUTTON_ICONS;

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

  override get commentsTitle(): string {
    return "Subtask Comments";
  }

  override get deleteItemTitle(): string {
    return "Delete subtask";
  }

  getStatusColor(status: string): string {
    return (
      STATUS_BUTTON_COLORS[status as keyof typeof STATUS_BUTTON_COLORS] ||
      STATUS_BUTTON_COLORS["pending"]
    );
  }

  getStatusBgColor(status: string): string {
    const statusLower = status.toLowerCase();
    if (statusLower === "completed")
      return "bg-green-100 text-green-600 hover:bg-green-200 dark:bg-green-900/40 dark:hover:bg-green-900/60";
    if (statusLower === "skipped")
      return "bg-orange-100 text-orange-600 hover:bg-orange-200 dark:bg-orange-900/40 dark:hover:bg-orange-900/60";
    if (statusLower === "failed")
      return "bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-900/60";
    return "bg-blue-100 text-blue-500 hover:bg-blue-200 dark:bg-blue-900/40 dark:hover:bg-blue-900/60";
  }

  getStatusIcon(status: string): string {
    return (
      STATUS_BUTTON_ICONS[status as keyof typeof STATUS_BUTTON_ICONS] ||
      STATUS_BUTTON_ICONS["pending"]
    );
  }

  getActionColor(action: string): string {
    return getActionColor(action, "rounded-lg p-1 transition-all duration-200 hover:scale-110");
  }

  deleteSubtask() {
    this.deleteItemEvent.emit(this.itemId);
  }

  toggleCompletion() {
    if (this.subtask) {
      this.toggleCompletionEvent.emit(this.subtask);
    }
  }

  override onAddComment(content: string): void {
    if (this.subtask) {
      this.addCommentEvent.emit({ content, subtask_id: this.subtask.id });
    }
  }
}
