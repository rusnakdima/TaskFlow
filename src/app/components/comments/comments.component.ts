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
} from "@angular/core";
import { FormsModule } from "@angular/forms";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Comment } from "@models/comment.model";

/* helpers */
import { BaseItemHelper } from "@helpers/base-item.helper";
import { AuthService } from "@services/auth.service";

@Component({
  selector: "app-comments",
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: "./comments.component.html",
})
export class CommentsComponent implements AfterViewInit {
  private baseHelper = inject(BaseItemHelper);
  private authService = inject(AuthService);

  @Input() comments: Comment[] = [];
  @Input() isOwner: boolean = true;
  @Input() isPrivate: boolean = true;

  @Output() addCommentEvent = new EventEmitter<string>();
  @Output() deleteCommentEvent = new EventEmitter<string>();
  @Output() markAsReadEvent = new EventEmitter<string[]>();

  @ViewChild("commentsList") commentsList?: ElementRef;

  newCommentContent = signal("");

  ngAfterViewInit() {
    this.handleUnreadComments();
  }

  private handleUnreadComments() {
    const userId = this.currentUserId;
    if (!userId) return;

    const unreadIds = this.comments
      .filter((c) => !c.readBy || !c.readBy.includes(userId))
      .map((c) => c.id);

    if (unreadIds.length > 0) {
      this.markAsReadEvent.emit(unreadIds);
    }

    // Scroll logic
    setTimeout(() => {
      if (this.commentsList) {
        const list = this.commentsList.nativeElement;
        const unreadElements = list.querySelectorAll(".unread-comment");
        if (unreadElements.length > 0) {
          unreadElements[0].scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
          list.scrollTop = list.scrollHeight;
        }
      }
    }, 100);
  }

  formatDate(date: string) {
    return this.baseHelper.formatDate(date);
  }

  get currentUserId() {
    return this.authService.getValueByKey("id");
  }

  isUnread(comment: Comment): boolean {
    const userId = this.currentUserId;
    return !!userId && (!comment.readBy || !comment.readBy.includes(userId));
  }

  addComment() {
    if (this.newCommentContent().trim()) {
      this.addCommentEvent.emit(this.newCommentContent().trim());
      this.newCommentContent.set("");
    }
  }

  deleteComment(commentId: string) {
    this.deleteCommentEvent.emit(commentId);
  }
}
