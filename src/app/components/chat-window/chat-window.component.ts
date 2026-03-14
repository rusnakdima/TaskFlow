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
import { of } from "rxjs";

/* models */
import { Chat, ChatCreate } from "@models/chat.model";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { StorageService } from "@services/core/storage.service";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

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

  dataSync = inject(DataSyncProvider);
  authService = inject(AuthService);
  storageService = inject(StorageService);

  newMessage = "";
  private shouldScroll = false;
  private forceScrollBottom = false;
  private observer?: IntersectionObserver;
  private isFirstLoad = true;
  private processedChatIds = new Set<string>(); // Track processed chats to prevent infinite loop

  // WebSocket listeners
  private chatCreatedListener: any;
  private chatUpdatedListener: any;
  private chatDeletedListener: any;
  private chatClearedListener: any;

  ngOnChanges(changes: SimpleChanges) {
    if (changes["todoId"] && !changes["todoId"].isFirstChange()) {
      this.isFirstLoad = true;
      this.processedChatIds.clear(); // Reset processed chats when todo changes
    }
  }

  ngOnInit() {
    this.initWebSocketListeners();
    this.loadChats(this.todoId).subscribe({
      next: () => {
        this.shouldScroll = true;
        setTimeout(() => this.initIntersectionObserver(), 500);
      }
    });
  }

  ngOnDestroy() {
    if (this.observer) {
      this.observer.disconnect();
    }
    this.removeWebSocketListeners();
  }

  private initWebSocketListeners(): void {
    this.chatCreatedListener = (event: any) => this.onChatCreated(event.detail);
    this.chatUpdatedListener = (event: any) => this.onChatUpdated(event.detail);
    this.chatDeletedListener = (event: any) => this.onChatDeleted(event.detail);
    this.chatClearedListener = (event: any) => this.onChatCleared(event.detail);

    window.addEventListener("ws-chat-created", this.chatCreatedListener);
    window.addEventListener("ws-chat-updated", this.chatUpdatedListener);
    window.addEventListener("ws-chat-deleted", this.chatDeletedListener);
    window.addEventListener("ws-chat-cleared", this.chatClearedListener);
  }

  private removeWebSocketListeners(): void {
    window.removeEventListener("ws-chat-created", this.chatCreatedListener);
    window.removeEventListener("ws-chat-updated", this.chatUpdatedListener);
    window.removeEventListener("ws-chat-deleted", this.chatDeletedListener);
    window.removeEventListener("ws-chat-cleared", this.chatClearedListener);
  }

  private onChatCreated(chat: Chat): void {
    this.storageService.addChatToTodo(chat.todoId, chat);
  }

  private onChatUpdated(chat: Chat): void {
    this.storageService.updateChatInTodo(chat.todoId, chat);
  }

  private onChatDeleted(chat: { id: string; todoId: string }): void {
    if ((chat as any).isDeleted === true) {
      this.storageService.updateChatInTodo(chat.todoId, { ...(chat as any), isDeleted: true });
    } else {
      this.storageService.deleteChatFromTodo(chat.todoId, chat.id);
    }
  }

  private onChatCleared(todoId: string): void {
    this.storageService.clearChatsByTodo(todoId);
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
            if (chatId && !this.processedChatIds.has(chatId)) {
              visibleUnreadIds.push(chatId);
              entriesToUnobserve.push(entry.target);
              this.processedChatIds.add(chatId); // Mark as processed
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
        unreadElements.forEach((el: Element) => {
          const chatId = el.getAttribute("data-chat-id");
          // Only observe if not already processed
          if (!chatId || !this.processedChatIds.has(chatId)) {
            this.observer?.observe(el);
          }
        });
      }
    }, 100);
  }

  private markSpecificAsRead(ids: string[]) {
    const currentUserId = this.authService.getValueByKey("id");
    const unreadInList = this.getChats(this.todoId)
      .filter((c: Chat) => ids.includes(c.id) && (!c.readBy || !c.readBy.includes(currentUserId)));

    if (unreadInList.length > 0) {
      this.markAsRead(this.todoId, ids).subscribe();
    }
  }

  private smartScroll(): void {
    const unread = this.getChats(this.todoId).find((c) => !this.isRead(c));

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

  // --- Chat Actions (previously in ChatService) ---

  getChats(todoId: string): Chat[] {
    return this.storageService.getChatsByTodo(todoId);
  }

  loadChats(todoId: string) {
    return this.dataSync.crud<Chat[]>("getAll", "chats", { filter: { todoId, isDeleted: false }, parentTodoId: todoId }, true);
  }

  sendMessage() {
    if (!this.newMessage.trim()) return;

    const currentUserId = this.authService.getValueByKey("id") || "";
    const username = this.authService.getValueByKey("username") || "User";

    const chatForBackend: ChatCreate = {
      todoId: this.todoId,
      userId: currentUserId,
      authorName: username,
      content: this.newMessage,
    };

    this.dataSync.crud<Chat>("create", "chats", { data: chatForBackend, parentTodoId: this.todoId }).subscribe(() => {
      this.newMessage = "";
      this.shouldScroll = true;
      this.forceScrollBottom = true; // Force bottom for sent messages
      setTimeout(() => this.updateObservedElements(), 500);
    });
  }

  deleteMessage(chatId: string) {
    this.dataSync.crud("delete", "chats", { id: chatId, parentTodoId: this.todoId }).subscribe();
  }

  markAsRead(todoId: string, ids?: string[]) {
    const currentUserId = this.authService.getValueByKey("id") || "";
    const chats = this.storageService.getChatsByTodo(todoId);

    const unreadChats = chats
      .filter(
        (chat) =>
          (!ids || ids.includes(chat.id)) && (!chat.readBy || !chat.readBy.includes(currentUserId))
      )
      .map((chat) => ({
        ...chat,
        readBy: [...(chat.readBy || []), currentUserId],
      }));

    if (unreadChats.length === 0) return of([]);

    return this.dataSync.crud<Chat[]>("updateAll", "chats", { data: unreadChats, parentTodoId: todoId }, true);
  }

  clearChat() {
    if (!confirm("Are you sure you want to clear all messages from this chat?")) return;
    
    const chats = this.storageService.getChatsByTodo(this.todoId);
    if (!chats || chats.length === 0) return;
    
    const chatsToDelete = chats.map((chat) => ({ ...chat, isDeleted: true }));
    this.dataSync.crud<Chat[]>("updateAll", "chats", { data: chatsToDelete, parentTodoId: this.todoId }, true).subscribe();
  }

  canDelete(chat: Chat): boolean {
    const currentUserId = this.authService.getValueByKey("id");
    const todo = this.storageService.getTodoById(chat.todoId);
    if (todo && todo.userId === currentUserId) return true;
    return chat.userId === currentUserId;
  }
}
