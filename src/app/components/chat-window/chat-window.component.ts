/* sys lib */
import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  inject,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  AfterViewChecked,
  OnChanges,
  SimpleChanges,
} from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule } from "@angular/router";
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Chat } from "@models/chat.model";

/* services */
import { ChatService } from "@services/chat.service";
import { AuthService } from "@services/auth.service";

@Component({
  selector: "app-chat-window",
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, DatePipe, RouterModule],
  templateUrl: "./chat-window.component.html",
})
export class ChatWindowComponent implements OnInit, AfterViewChecked, OnDestroy, OnChanges {
  @Input({ required: true }) todoId!: string;
  @Output() close = new EventEmitter<void>();
  @ViewChild("scrollContainer") private scrollContainer!: ElementRef;

  chatService = inject(ChatService);
  authService = inject(AuthService);

  newMessage = "";
  private shouldScroll = false;
  private forceScrollBottom = false;
  private observer?: IntersectionObserver;
  private isFirstLoad = true;

  ngOnChanges(changes: SimpleChanges) {
    if (changes["todoId"] && !changes["todoId"].isFirstChange()) {
      this.isFirstLoad = true;
    }
  }

  ngOnInit() {
    this.chatService.loadChats(this.todoId).subscribe(() => {
      this.shouldScroll = true;
      setTimeout(() => this.initIntersectionObserver(), 500);
    });
  }

  ngOnDestroy() {
    this.chatService.closeChat();
    if (this.observer) {
      this.observer.disconnect();
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

  private initIntersectionObserver() {
    if (!this.scrollContainer) return;

    if (this.observer) {
      this.observer.disconnect();
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        const visibleUnreadIds: string[] = [];
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const chatId = entry.target.getAttribute("data-chat-id");
            if (chatId) {
              visibleUnreadIds.push(chatId);
            }
          }
        });

        if (visibleUnreadIds.length > 0) {
          this.markSpecificAsRead(visibleUnreadIds);
        }
      },
      {
        root: this.scrollContainer.nativeElement,
        threshold: 0.5,
      }
    );

    this.updateObservedElements();
  }

  private updateObservedElements() {
    setTimeout(() => {
      const list = this.scrollContainer?.nativeElement;
      if (list) {
        const unreadElements = list.querySelectorAll(".unread-chat");
        unreadElements.forEach((el: Element) => this.observer?.observe(el));
      }
    }, 100);
  }

  private markSpecificAsRead(ids: string[]) {
    const currentUserId = this.authService.getValueByKey("id");
    const unreadInList = this.chatService
      .chats()
      .filter((c) => ids.includes(c.id) && (!c.readBy || !c.readBy.includes(currentUserId)));

    if (unreadInList.length > 0) {
      this.chatService.markAsRead(this.todoId, ids).subscribe();
    }
  }

  private smartScroll(): void {
    const currentUserId = this.authService.getValueByKey("id");
    const unread = this.chatService.chats().find((c) => !this.isRead(c));

    if (unread && this.isFirstLoad) {
      const element = document.getElementById("chat-" + unread.id);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
        this.isFirstLoad = false;
        return;
      }
    }

    if (this.isFirstLoad) {
      this.scrollToBottom();
      this.isFirstLoad = false;
    }
  }

  private scrollToBottom(): void {
    try {
      this.scrollContainer.nativeElement.scrollTop =
        this.scrollContainer.nativeElement.scrollHeight;
    } catch (err) {}
  }

  isMyMessage(chat: Chat): boolean {
    return chat.userId === this.authService.getValueByKey("id");
  }

  isRead(chat: Chat): boolean {
    const userId = this.authService.getValueByKey("id");
    return !!chat.readBy && chat.readBy.includes(userId);
  }

  isOwner(): boolean {
    const currentUserId = this.authService.getValueByKey("id");
    const todo = this.chatService.storageService.getTodoById(this.todoId);
    return todo?.userId === currentUserId;
  }

  clearChat() {
    if (confirm("Are you sure you want to clear all messages from this chat?")) {
      this.chatService.clearChat(this.todoId).subscribe();
    }
  }

  sendMessage() {
    if (!this.newMessage.trim()) return;
    this.chatService.addMessage(this.todoId, this.newMessage).subscribe(() => {
      this.newMessage = "";
      this.shouldScroll = true;
      this.forceScrollBottom = true; // Force bottom for sent messages
      setTimeout(() => this.updateObservedElements(), 500);
    });
  }

  deleteMessage(chatId: string) {
    this.chatService.deleteMessage(chatId, this.todoId).subscribe();
  }
}
