/* sys lib */
import { CommonModule } from "@angular/common";
import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
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
import { Comment } from "@models/comment.model";
import { Todo } from "@models/todo.model";
import { Subtask } from "@models/subtask.model";

@Component({
  selector: "app-subtask-table-row",
  standalone: true,
  imports: [CommonModule, MatIconModule, DragDropModule, CommentsComponent, CheckboxComponent],
  template: `
    @if (item) {
      <div
        class="rounded-xl border border-gray-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800"
      >
        <div class="mb-3 flex items-start justify-between">
          <div class="flex items-center gap-2">
            <label
              class="inline-flex shrink-0 cursor-pointer items-center transition-all duration-200 select-none hover:scale-110"
              (click)="$event.stopPropagation()"
            >
              <app-checkbox [checked]="isSelected" (checkedChange)="onSelectionChange($event)" />
            </label>
            <div>
              <h4
                class="font-semibold"
                [class]="
                  item.status === 'completed' ||
                  item.status === 'skipped' ||
                  item.status === 'failed'
                    ? 'text-gray-500 line-through dark:text-gray-400'
                    : ''
                "
              >
                {{ item.title }}
              </h4>
              @if (item.description) {
                <p class="textMuted mt-1 line-clamp-2 text-sm">{{ item.description }}</p>
              }
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span
              class="rounded-full px-2 py-1 text-xs font-medium"
              [ngClass]="getSubtaskPriorityColor(item.priority || 'medium')"
            >
              {{ (item.priority || "medium").toUpperCase() }}
            </span>
            <button
              class="flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-200 hover:scale-110"
              (click)="toggleCompletion()"
              [ngClass]="
                item.status === 'completed'
                  ? 'bg-green-100 text-green-600 hover:bg-green-200 dark:bg-green-900/40 dark:hover:bg-green-900/60'
                  : item.status === 'skipped'
                    ? 'bg-orange-100 text-orange-600 hover:bg-orange-200 dark:bg-orange-900/40 dark:hover:bg-orange-900/60'
                    : item.status === 'failed'
                      ? 'bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-900/60'
                      : 'bg-blue-100 text-blue-500 hover:bg-blue-200 dark:bg-blue-900/40 dark:hover:bg-blue-900/60'
              "
            >
              <mat-icon
                class="h-5! w-5! min-w-5 text-xl!"
                [fontIcon]="getSubtaskStatusIcon(item.status)"
              />
            </button>
          </div>
        </div>

        @if (showComments()) {
          <app-comments
            [comments]="itemComments"
            [subtask_id]="item.id"
            [todo]="todo"
            (addCommentEvent)="onAddComment($event)"
            (deleteCommentEvent)="onDeleteComment($event)"
            (markAsReadEvent)="onMarkAsRead($event)"
          />
        }

        <div
          class="mt-4 flex items-center justify-between border-t border-gray-200 pt-3 dark:border-zinc-700"
        >
          <div class="flex items-center gap-2">
            <button
              class="cursor-move rounded-lg p-2 text-gray-600 transition-all duration-200 hover:scale-110 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              cdkDragHandle
              title="Drag to reorder"
            >
              <mat-icon class="h-5! w-5! min-w-5 text-xl!" fontIcon="drag_indicator" />
            </button>
          </div>
          <div class="flex items-center gap-1">
            <button
              class="rounded-lg p-1 text-gray-600 transition-all duration-200 hover:scale-110 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              (click)="toggleComments()"
              title="Toggle comments"
            >
              <mat-icon class="h-5! w-5! min-w-5 text-xl!" fontIcon="forum" />
            </button>
            <button
              class="rounded-lg p-1 text-gray-600 transition-all duration-200 hover:scale-110 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              (click)="onActionClick('edit')"
              title="Edit subtask"
            >
              <mat-icon class="h-5! w-5! min-w-5 text-xl!" fontIcon="edit" />
            </button>
            <button
              class="rounded-lg p-1 text-red-500 transition-all duration-200 hover:scale-110 hover:bg-red-50 dark:hover:bg-red-900/30"
              (click)="deleteItem()"
              title="Delete subtask"
            >
              <mat-icon class="h-5! w-5! min-w-5 text-xl!" fontIcon="delete" />
            </button>
          </div>
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubtaskTableRowComponent extends ItemRowBaseComponent {
  @Input() subtask: Subtask | null = null;
  @Input() override todo: Todo | null = null;
  @Output() override toggleCompletionEvent = new EventEmitter<Subtask>();

  private cdr = inject(ChangeDetectorRef);

  override get item(): Subtask | null {
    return this.subtask;
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

  override onAddComment(content: string): void {
    if (this.subtask) {
      this.addCommentEvent.emit({ content, subtask_id: this.subtask.id });
    }
  }
}
