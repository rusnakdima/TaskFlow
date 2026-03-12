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
import { ChatService } from "@services/features/chat.service";
import { AuthService } from "@services/auth/auth.service";
import { StorageService } from "@services/core/storage.service";

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
  @ViewChild("messageInput") private messageInput!: ElementRef<HTMLTextAreaElement>;

  chatService = inject(ChatService);
  authService = inject(AuthService);
  storageService = inject(StorageService);

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
    this.chatService.loadChats(this.todoId).subscribe({
      next: (chats) => {
        this.shouldScroll = true;
        setTimeout(() => this.initIntersectionObserver(), 500);
      }
    });
  }

  ngOnDestroy() {
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

  handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
    // Shift+Enter allows inserting newline (default textarea behavior)
  }

  private initIntersectionObserver() {
    if (!this.scrollContainer) return;

    if (this.observer) {
      this.observer.disconnect();
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        const visibleUnreadIds: string[] = [];
        const entriesToUnobserve: Element[] = [];
        
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const chatId = entry.target.getAttribute("data-chat-id");
            if (chatId) {
              visibleUnreadIds.push(chatId);
              entriesToUnobserve.push(entry.target);
            }
          }
        });

        if (visibleUnreadIds.length > 0) {
          this.markSpecificAsRead(visibleUnreadIds);
          // Unobserve elements after marking as read to prevent infinite loop
          entriesToUnobserve.forEach((el) => this.observer?.unobserve(el));
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
      .getChats(this.todoId)
      .filter((c: Chat) => ids.includes(c.id) && (!c.readBy || !c.readBy.includes(currentUserId)));

    if (unreadInList.length > 0) {
      this.chatService.markAsRead(this.todoId, ids).subscribe();
    }
  }

  private smartScroll(): void {
    const currentUserId = this.authService.getValueByKey("id");
    const unread = this.chatService.getChats(this.todoId).find((c) => !this.isRead(c));

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

  getUnreadCount(): number {
    const currentUserId = this.authService.getValueByKey("id");
    const chats = this.storageService.getChatsByTodo(this.todoId);
    return chats.filter((c) => !c.readBy || !c.readBy.includes(currentUserId)).length;
  }

  isOwner(): boolean {
    const currentUserId = this.authService.getValueByKey("id");
    const todo = this.storageService.getTodoById(this.todoId);
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
