/* sys lib */
import { CommonModule } from "@angular/common";
import {
  Component,
  EventEmitter,
  Input,
  Output,
  signal,
  inject,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnChanges,
  SimpleChanges,
  OnDestroy,
  AfterViewChecked,
} from "@angular/core";
import { FormsModule } from "@angular/forms";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Comment } from "@models/comment.model";
import { Todo } from "@models/todo.model";
import { StorageService } from "@services/core/storage.service";

/* helpers */
import { BaseItemHelper } from "@helpers/base-item.helper";
import { DateHelper } from "@helpers/date.helper";
import { AuthService } from "@services/auth/auth.service";

/* mixins */
import { ScrollingMixin } from "@mixins/scrolling.mixin";

@Component({
  selector: "app-comments",
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: "./comments.component.html",
})
export class CommentsComponent
  extends ScrollingMixin
  implements AfterViewInit, OnChanges, OnDestroy, AfterViewChecked
{
  private authService = inject(AuthService);
  private storageService = inject(StorageService);

  @Input() title: string = "Comments";
  @Input() comments: Comment[] = [];
  @Input() task_id?: string;
  @Input() subtask_id?: string;
  @Input() todo_id?: string;
  @Input() highlightCommentId?: string;
  @Input() autoOpen?: boolean = false;
  @Input() todo: Todo | null = null;

  @Output() addCommentEvent = new EventEmitter<string>();
  @Output() deleteCommentEvent = new EventEmitter<string>();
  @Output() markAsReadEvent = new EventEmitter<string[]>();

  @ViewChild("scrollContainer") override scrollContainer!: ElementRef;

  newCommentContent = signal("");
  private forceScrollBottom = false;

  ngOnChanges(changes: SimpleChanges) {
    if (changes["comments"] && !changes["comments"].isFirstChange()) {
      this.shouldScroll.set(true);
      setTimeout(
        () =>
          this.initIntersectionObserver(".unread-comment", "data-comment-id", (id: string) =>
            this.markAsReadEvent.emit([id])
          ),
        100
      );
    }
    if ((changes["task_id"] || changes["subtaskId"]) && !changes["task_id"]?.isFirstChange()) {
      this.isFirstLoad.set(true);
      this.processedIds.set(new Set());
    }
  }

  ngAfterViewInit() {
    this.initIntersectionObserver(".unread-comment", "data-comment-id", (id: string) =>
      this.markAsReadEvent.emit([id])
    );
    this.shouldScroll.set(true);

    if (this.highlightCommentId) {
      setTimeout(() => {
        const element = document.getElementById("comment-" + this.highlightCommentId);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 300);
    }
  }

  ngAfterViewChecked() {
    if (this.shouldScroll()) {
      if (this.forceScrollBottom) {
        this.scrollToBottom();
        this.forceScrollBottom = false;
      } else {
        this.smartScroll();
      }
      this.shouldScroll.set(false);
    }
  }

  ngOnDestroy() {
    this.destroyObserver();
  }

  formatDate(date: string) {
    return DateHelper.formatDateShort(date);
  }

  get currentUserId() {
    return this.authService.getValueByKey("id");
  }

  isUnread(comment: Comment): boolean {
    const userId = this.currentUserId;
    if (!userId) return false;
    if (comment.user_id === userId) return false;
    return !comment.read_by || !comment.read_by.includes(userId);
  }

  addComment() {
    if (this.newCommentContent().trim()) {
      this.addCommentEvent.emit(this.newCommentContent().trim());
      this.newCommentContent.set("");
      this.forceScrollBottom = true;
      this.shouldScroll.set(true);
      setTimeout(() => this.updateObservedElements(".unread-comment", "data-comment-id"), 100);
    }
  }

  deleteComment(commentId: string) {
    this.deleteCommentEvent.emit(commentId);
  }

  getUsername(userId: string): string {
    return this.storageService.getUsername(userId);
  }

  canEditComment(comment?: Comment): boolean {
    if (!comment) return false;
    if (comment.user_id === this.currentUserId) return true;
    if (this.todo) {
      const todoOwnerId = this.todo.user_id;
      if (todoOwnerId === this.currentUserId && this.todo.visibility !== "private") {
        return true;
      }
    }
    return false;
  }
}
