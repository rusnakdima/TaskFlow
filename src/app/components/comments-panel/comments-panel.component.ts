/* sys lib */
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

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* components */
import { CommentsComponent } from "@components/comments/comments.component";

/* models */
import { Comment } from "@models/comment.model";
import { Todo } from "@models/todo.model";

@Component({
  selector: "app-comments-panel",
  standalone: true,
  imports: [CommonModule, MatIconModule, CommentsComponent],
  templateUrl: "./comments-panel.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommentsPanelComponent {
  private cdr = inject(ChangeDetectorRef);

  @Input() comments: Comment[] = [];
  @Input() itemType: "task" | "subtask" = "task";
  @Input() itemId: string = "";
  @Input() todo: Todo | null = null;
  @Input() highlightCommentId: string | null = null;
  @Input() subtaskComments: Comment[][] = [];

  @Output() addCommentEvent = new EventEmitter<string>();
  @Output() deleteCommentEvent = new EventEmitter<string>();
  @Output() markAsReadEvent = new EventEmitter<string[]>();

  isExpanded = signal(true);

  get filteredComments(): Comment[] {
    return this.comments.filter((c) => !c.deleted_at);
  }

  getFilteredSubtaskComments(comments: Comment[]): Comment[] {
    return comments.filter((c) => !c.deleted_at);
  }

  get totalSubtaskComments(): number {
    return this.subtaskComments.reduce((acc, comments) => acc + (comments?.length || 0), 0);
  }

  get title(): string {
    const count = this.filteredComments.length;
    return this.itemType === "task" ? `Task Comments (${count})` : `Subtask Comments (${count})`;
  }

  toggleExpand(): void {
    this.isExpanded.update((v) => !v);
    this.cdr.markForCheck();
  }

  onAddComment(content: string): void {
    this.addCommentEvent.emit(content);
  }

  onDeleteComment(commentId: string): void {
    this.deleteCommentEvent.emit(commentId);
  }

  onMarkAsRead(commentIds: string[]): void {
    this.markAsReadEvent.emit(commentIds);
  }
}
