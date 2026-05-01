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
  signal,
  effect,
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
import { ApiProvider } from "@providers/api.provider";

@Component({
  selector: "app-chat-window",
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, DatePipe, RouterModule],
  templateUrl: "./chat-window.component.html",
})
export class ChatWindowComponent implements OnInit, AfterViewChecked, OnDestroy, OnChanges {
  @Input({ required: true }) todo_id!: string;
  @Output() close = new EventEmitter<void>();
  @ViewChild("scrollContainer") private scrollContainer!: ElementRef;
  @ViewChild("messageInput") private messageInput!: ElementRef<HTMLTextAreaElement>;

  dataSync = inject(ApiProvider);
  authService = inject(AuthService);
  storageService = inject(StorageService);

  chats = signal<Chat[]>([]);

  private chatReactiveEffect = effect(() => {
    const reactiveChats = this.storageService.getChatsByTodoReactive(this.todo_id)();
    this.chats.set(reactiveChats);
  });

  newMessage = "";
  private shouldScroll = false;
  private forceScrollBottom = false;
  private observer?: IntersectionObserver;
  private isFirstLoad = true;
  private processedChatIds = new Set<string>(); // Track processed chats to prevent infinite loop

  ngOnChanges(changes: SimpleChanges) {
    if (changes["todo_id"] && !changes["todo_id"].isFirstChange()) {
      this.isFirstLoad = true;
      this.processedChatIds.clear(); // Reset processed chats when todo changes
    }
  }

  ngOnInit() {
    this.shouldScroll = true;
    setTimeout(() => this.initIntersectionObserver(), 500);
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
    const unreadInList = this.chats().filter(
      (c: Chat) => ids.includes(c.id) && (!c.read_by || !c.read_by.includes(currentUserId))
    );

    if (unreadInList.length > 0) {
      this.markAsRead(this.todo_id, ids).subscribe();
    }
  }

  private smartScroll(): void {
    const unread = this.chats().find((c) => !this.isRead(c));

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
    } catch (err: unknown) {
      console.error("Failed to scroll to bottom:", err);
    }
  }

  isMyMessage(chat: Chat): boolean {
    return chat.user_id === this.authService.getValueByKey("id");
  }

  isRead(chat: Chat): boolean {
    const userId = this.authService.getValueByKey("id");
    return !!chat.read_by && chat.read_by.includes(userId);
  }

  getUnreadCount(): number {
    const currentUserId = this.authService.getValueByKey("id");
    return this.chats().filter((c) => !c.read_by || !c.read_by.includes(currentUserId)).length;
  }

  isOwner(): boolean {
    const currentUserId = this.authService.getValueByKey("id");
    const todo = this.storageService.getById("todos", this.todo_id);
    return todo?.user_id === currentUserId;
  }

  // --- Chat Actions (previously in ChatService) ---

  getChats(): Chat[] {
    return this.chats();
  }

  sendMessage() {
    if (!this.newMessage.trim()) return;

    const currentUserId = this.authService.getValueByKey("id") || "";

    const chatForBackend: ChatCreate = {
      todo_id: this.todo_id,
      user_id: currentUserId,
      content: this.newMessage,
    };

    const todo = this.storageService.getById("todos", this.todo_id);
    const visibility = todo?.visibility === "team" ? "team" : "private";

    this.dataSync
      .crud<Chat>("create", "chats", {
        data: chatForBackend,
        parentTodoId: this.todo_id,
        visibility,
      })
      .subscribe(() => {
        this.newMessage = "";
        this.shouldScroll = true;
        this.forceScrollBottom = true;
        setTimeout(() => this.updateObservedElements(), 500);
      });
  }

  deleteMessage(chatId: string) {
    this.dataSync.crud("delete", "chats", { id: chatId, parentTodoId: this.todo_id }).subscribe({
      error: (err) => console.error("Delete chat failed:", err),
    });
  }

  markAsRead(todo_id?: string, ids?: string[]) {
    const currentUserId = this.authService.getValueByKey("id") || "";
    const chats = this.chats();

    const unreadChats = chats
      .filter(
        (chat) =>
          (!ids || ids.includes(chat.id)) &&
          (!chat.read_by || !chat.read_by.includes(currentUserId))
      )
      .map((chat) => ({
        ...chat,
        readBy: [...(chat.read_by || []), currentUserId],
      }));

    if (unreadChats.length === 0) return of([]);

    return this.dataSync.crud<Chat[]>("updateAll", "chats", {
      data: unreadChats,
      parentTodoId: todo_id,
    });
  }

  clearChat() {
    if (!confirm("Are you sure you want to clear all messages from this chat?")) return;

    const chats = this.chats();
    if (!chats || chats.length === 0) return;

    const chatsToDelete = chats.map((chat) => ({ ...chat, deleted_at: new Date().toISOString() }));
    this.dataSync
      .crud<Chat[]>("updateAll", "chats", { data: chatsToDelete, parentTodoId: this.todo_id })
      .subscribe();
  }

  getUsername(userId: string): string {
    // First try to get from nested user data in chat responses
    const chatWithUser = this.chats().find((c) => c.user_id === userId);
    if (chatWithUser?.user?.username) return chatWithUser.user.username;
    if (chatWithUser?.user?.email) return chatWithUser.user.email;

    // Then try storage
    const user = this.storageService.getById("users", userId);
    if (user?.username) return user.username;
    if (user?.email) return user.email;
    const currentUser = this.storageService.user();
    if (currentUser?.id === userId && currentUser?.username) return currentUser.username;

    // Try profile which has user relation loaded
    const profile = this.storageService.profile();
    if (profile?.user?.username) return profile.user.username;
    if (profile?.user?.email) return profile.user.email;

    return this.authService.getValueByKey("username") || "User";
  }

  canDelete(chat: Chat): boolean {
    const currentUserId = this.authService.getValueByKey("id");
    const todo = this.storageService.getById("todos", chat.todo_id);
    if (todo && todo.user_id === currentUserId) return true;
    return chat.user_id === currentUserId;
  }
}
