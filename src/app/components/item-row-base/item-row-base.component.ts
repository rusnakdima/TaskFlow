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
} from "@angular/core";

import { MatIconModule } from "@angular/material/icon";

import { CommentsComponent } from "@components/comments/comments.component";
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

import { BaseItemHelper } from "@helpers/base-item.helper";

import { AuthService } from "@services/auth/auth.service";
import { StorageService } from "@services/core/storage.service";
import { ApiProvider } from "@providers/api.provider";

import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Comment, Todo } from "@models";

export abstract class ItemRowBaseComponent {
  protected authService = inject(AuthService);
  protected storageService = inject(StorageService);
  protected dataSyncProvider = inject(ApiProvider);
  protected cdr = inject(ChangeDetectorRef);

  @Input() isOwner: boolean = true;
  @Input() isPrivate: boolean = true;
  @Input() isSelected: boolean = false;
  @Input() todo: Todo | null = null;

  @Output() selectionChangeEvent = new EventEmitter<{ id: string; selected: boolean }>();
  @Output() deleteCommentEvent = new EventEmitter<string>();
  @Output() markAsReadEvent = new EventEmitter<string[]>();
  @Output() actionClickEvent = new EventEmitter<{ action: string; item: any }>();

  showComments = signal(false);

  getSubtaskStatusIcon = BaseItemHelper.getStatusIcon;
  getSubtaskStatusColor = BaseItemHelper.getStatusColor;
  getSubtaskPriorityColor = BaseItemHelper.getPriorityColor;

  abstract get item(): Task | Subtask | null;
  abstract get type(): "task" | "subtask";
  abstract get itemComments(): Comment[];
  abstract get itemId(): string;
  abstract get itemTitle(): string;
  abstract get itemDescription(): string | null;
  abstract get itemStatus(): string;
  abstract get itemPriority(): string;
  abstract get isSubtask(): boolean;
  abstract get itemSubtasks(): Subtask[];
  abstract get subtaskCount(): number;
  abstract get commentsTitle(): string;
  abstract get deleteItemTitle(): string;
  abstract get itemDeleteEvent(): EventEmitter<string>;
  abstract get addCommentEvent(): EventEmitter<
    { content: string; task_id: string } | { content: string; subtask_id: string }
  >;

  toggleComments() {
    this.showComments.update((v) => !v);
    this.cdr.markForCheck();
  }

  onSelectionChange(checked: boolean): void {
    this.selectionChangeEvent.emit({ id: this.itemId, selected: checked });
  }

  onAddComment(content: string) {
    this.addCommentEvent.emit({
      content,
      task_id: this.type === "task" ? this.itemId : "",
      subtask_id: this.type === "subtask" ? this.itemId : "",
    });
  }

  onDeleteComment(commentId: string) {
    this.deleteCommentEvent.emit(commentId);
  }

  onMarkAsRead(commentIds: string[]) {
    this.markAsReadEvent.emit(commentIds);
  }

  deleteItem() {
    this.itemDeleteEvent.emit(this.itemId);
  }

  onActionClick(action: string) {
    this.actionClickEvent.emit({ action, item: this.item });
  }
}
