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

/* helpers */
import { BaseItemHelper } from "@helpers/base-item.helper";
import { DateHelper } from "@helpers/date.helper";
import { AuthService } from "@services/auth/auth.service";

@Component({
  selector: "app-comments",
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: "./comments.component.html",
})
export class CommentsComponent implements AfterViewInit, OnChanges, OnDestroy, AfterViewChecked {
  private authService = inject(AuthService);

  @Input() title: string = "Comments";
  @Input() comments: Comment[] = [];
  @Input() isOwner: boolean = true;
  @Input() isPrivate: boolean = true;
  @Input() task_id?: string;
  @Input() subtask_id?: string;
  @Input() highlightCommentId?: string;
  @Input() autoOpen?: boolean = false;

  @Output() addCommentEvent = new EventEmitter<string>();
  @Output() deleteCommentEvent = new EventEmitter<string>();
  @Output() markAsReadEvent = new EventEmitter<string[]>();

  @ViewChild("commentsList") commentsList?: ElementRef;

  newCommentContent = signal("");
  private isFirstLoad = true;
  private shouldScroll = false;
  private forceScrollBottom = false;
  private observer?: IntersectionObserver;
  private processedCommentIds = new Set<string>(); // Track processed comments to prevent infinite loop

  ngOnChanges(changes: SimpleChanges) {
    if (changes["comments"] && !changes["comments"].isFirstChange()) {
      this.shouldScroll = true;
      setTimeout(() => this.initIntersectionObserver(), 100);
    }
    if ((changes["task_id"] || changes["subtaskId"]) && !changes["task_id"]?.isFirstChange()) {
      this.isFirstLoad = true;
      this.processedCommentIds.clear(); // Reset processed comments when task/subtask changes
    }
  }

  ngAfterViewInit() {
    this.initIntersectionObserver();
    this.shouldScroll = true;

    // Scroll to highlighted comment if specified
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
    if (this.shouldScroll) {
      if (this.forceScrollBottom) {
        this.scrollToBottom();
        this.forceScrollBottom = false;
      } else {
        this.smartScroll();
      }
      this.shouldScroll = false;
    }
  }

  ngOnDestroy() {
    if (this.observer) {
      this.observer.disconnect();
    }
  }

  private initIntersectionObserver() {
    if (!this.commentsList) return;

    if (this.observer) {
      this.observer.disconnect();
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        const visibleUnreadIds: string[] = [];
        const entriesToUnobserve: Element[] = [];

        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const commentId = entry.target.getAttribute("data-comment-id");
            if (commentId && !this.processedCommentIds.has(commentId)) {
              visibleUnreadIds.push(commentId);
              entriesToUnobserve.push(entry.target);
              this.processedCommentIds.add(commentId); // Mark as processed
            }
          }
        });

        if (visibleUnreadIds.length > 0) {
          this.markAsReadEvent.emit(visibleUnreadIds);
          // Unobserve elements after marking as read to prevent infinite loop
          entriesToUnobserve.forEach((el) => this.observer?.unobserve(el));
        }
      },
      {
        root: this.commentsList.nativeElement,
        threshold: 0.5,
      }
    );

    setTimeout(() => {
      const list = this.commentsList?.nativeElement;
      if (list) {
        const unreadElements = list.querySelectorAll(".unread-comment");
        unreadElements.forEach((el: Element) => {
          const commentId = el.getAttribute("data-comment-id");
          // Only observe if not already processed
          if (!commentId || !this.processedCommentIds.has(commentId)) {
            this.observer?.observe(el);
          }
        });
      }
    }, 100);
  }

  private smartScroll() {
    if (this.commentsList && this.isFirstLoad) {
      const list = this.commentsList.nativeElement;
      const unreadElements = list.querySelectorAll(".unread-comment");
      if (unreadElements.length > 0) {
        unreadElements[0].scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        list.scrollTop = list.scrollHeight;
      }
      this.isFirstLoad = false;
    }
  }

  private scrollToBottom() {
    if (this.commentsList) {
      this.commentsList.nativeElement.scrollTop = this.commentsList.nativeElement.scrollHeight;
    }
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
    if (comment.author_id === userId) return false;
    return !comment.read_by || !comment.read_by.includes(userId);
  }

  addComment() {
    if (this.newCommentContent().trim()) {
      this.addCommentEvent.emit(this.newCommentContent().trim());
      this.newCommentContent.set("");
      this.forceScrollBottom = true;
      this.shouldScroll = true;
    }
  }

  deleteComment(commentId: string) {
    this.deleteCommentEvent.emit(commentId);
  }
}
