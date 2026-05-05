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

/* services */
import { Router } from "@angular/router";

export interface SubtaskCommentGroup {
  subtask_id: string;
  title: string;
  comments: Comment[];
}

@Component({
  selector: "app-subtask-comments-list",
  standalone: true,
  imports: [CommonModule, MatIconModule, CommentsComponent],
  templateUrl: "./subtask-comments-list.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubtaskCommentsListComponent {
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  @Input() subtaskCommentGroups: SubtaskCommentGroup[] = [];
  @Input() todo: Todo | null = null;
  @Input() highlightSubtaskId: string | null = null;
  @Input() taskIdForSubtasks: string | null = null;

  @Output() addCommentEvent = new EventEmitter<{ content: string; subtask_id: string }>();
  @Output() deleteCommentEvent = new EventEmitter<string>();
  @Output() markAsReadEvent = new EventEmitter<string[]>();

  expandedSubtaskIds = signal<Set<string>>(new Set());
  private highlightedExpandedSubtaskId = signal<string | null>(null);

  toggleSubtaskExpand(subtask_id: string) {
    this.expandedSubtaskIds.update((set) => {
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
    return this.expandedSubtaskIds().has(subtask_id);
  }

  shouldHighlightSubtask(subtask_id: string): boolean {
    return this.highlightedExpandedSubtaskId() === subtask_id;
  }

  onAddSubtaskComment(content: string, subtask_id: string) {
    this.addCommentEvent.emit({ content, subtask_id });
  }

  onDeleteComment(commentId: string) {
    this.deleteCommentEvent.emit(commentId);
  }

  onMarkAsRead(commentIds: string[]) {
    this.markAsReadEvent.emit(commentIds);
  }

  navigateToSubtaskComments(subtask_id: string) {
    if (!this.taskIdForSubtasks || !this.todo?.id) return;
    this.router.navigate(["/todos", this.todo.id, "tasks", this.taskIdForSubtasks, "subtasks"], {
      queryParams: {
        highlightSubtask: subtask_id,
        openComments: true,
      },
    });
  }
}
