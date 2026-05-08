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
  DestroyRef,
} from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule } from "@angular/router";
import { MatIconModule } from "@angular/material/icon";
import { of, Subscription } from "rxjs";

/* models */
import { Chat, ChatCreate } from "@models/chat.model";
import { Todo } from "@models/todo.model";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { StorageService } from "@services/storage.service";
import { REQUEST_SERVICE } from "@services/api.service";
import { ConfirmDialogService } from "@services/core/confirm-dialog.service";

/* mixins */
import { ScrollingMixin } from "@mixins/scrolling.mixin";

@Component({
  selector: "app-chat-window",
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, DatePipe, RouterModule],
  templateUrl: "./chat-window.component.html",
})
export class ChatWindowComponent
  extends ScrollingMixin
  implements OnInit, AfterViewChecked, OnDestroy, OnChanges
{
  @Input({ required: true }) todo_id!: string;
  @Output() close = new EventEmitter<void>();
  @ViewChild("scrollContainer") override scrollContainer!: ElementRef;
  @ViewChild("messageInput") private messageInput!: ElementRef<HTMLTextAreaElement>;

  authService = inject(AuthService);
  storageService = inject(StorageService);
  apiService = inject(REQUEST_SERVICE);
  private destroyRef = inject(DestroyRef);
  private confirmDialogService = inject(ConfirmDialogService);

  chats = signal<Chat[]>([]);

  messages = signal<Chat[]>([]);
  hasMoreMessages = signal(true);
  loadingOlder = signal(false);
  loadingInitial = signal(false);
  oldestTimestamp = signal<string | null>(null);
  currentTodoId = "";
  private initialized = false;

  private subscriptions = new Subscription();
  private currentTodo = signal<any>(null);
  private usernameCache = new Map<string, string>();

  private loadChatsEffect = effect(() => {
    const todoId = this.todo_id;
    if (!todoId || this.initialized) return;
    const todo = this.currentTodo();
    const visibility = todo?.visibility === "shared" ? "shared" : "private";
    this.initialized = true;
    this.loadInitialChats(todoId, visibility);
  });

  newMessage = "";
  private forceScrollBottom = false;

  ngOnChanges(changes: SimpleChanges) {
    if (changes["todo_id"]) {
      this.initialized = false;
      this.isFirstLoad.set(true);
      this.processedIds.set(new Set());
    }
  }

  ngOnInit() {
    this.shouldScroll.set(true);
    this.loadTodo();
    setTimeout(
      () =>
        this.initIntersectionObserver(".unread-chat", "data-chat-id", (id: string) =>
          this.markSpecificAsRead([id])
        ),
      500
    );
  }

  ngOnDestroy() {
    this.destroyObserver();
    this.subscriptions.unsubscribe();
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

  private loadTodo() {
    this.subscriptions.add(
      this.apiService.get<Todo>("todos", this.todo_id).subscribe({
        next: (todo) => this.currentTodo.set(todo),
        error: () => this.currentTodo.set(null),
      })
    );
  }

  private loadInitialChats(todoId: string, visibility: string = "private") {
    if (this.loadingInitial()) return;
    this.loadingInitial.set(true);

    const cachedChats = this.storageService.getChatsByTodoId(todoId);
    if (cachedChats && cachedChats.length > 0) {
      const nonDeleted = cachedChats.filter((c) => !c.deleted_at);
      const reversed = [...nonDeleted].reverse();
      this.messages.set(reversed);
      this.cacheUsernames(nonDeleted);
      if (nonDeleted.length > 0) {
        this.oldestTimestamp.set(nonDeleted[nonDeleted.length - 1].created_at);
        this.hasMoreMessages.set(nonDeleted.length >= 10);
      }
      this.loadingInitial.set(false);
      return;
    }

    this.apiService
      .getAll<Chat>("chats", {
        filter: { todo_id: todoId },
        load: ["user"],
        visibility: visibility as any,
      })
      .subscribe({
        next: (chats) => {
          const nonDeleted = chats.filter((c) => !c.deleted_at);
          const reversed = [...nonDeleted].reverse();
          this.messages.set(reversed);
          this.cacheUsernames(nonDeleted);
          if (nonDeleted.length > 0) {
            this.oldestTimestamp.set(nonDeleted[nonDeleted.length - 1].created_at);
            this.hasMoreMessages.set(nonDeleted.length >= 10);
          }
        },
        complete: () => this.loadingInitial.set(false),
        error: () => this.loadingInitial.set(false),
      });
  }

  private cacheUsernames(chats: Chat[]) {
    for (const chat of chats) {
      if (chat.author_name) {
        this.usernameCache.set(chat.user_id, chat.author_name);
      } else if (chat.user?.username) {
        this.usernameCache.set(chat.user_id, chat.user.username);
      }
    }
  }

  loadOlderChats(todoId: string) {
    if (this.loadingOlder() || !this.hasMoreMessages()) return;

    const timestamp = this.oldestTimestamp();
    if (!timestamp) return;

    this.loadingOlder.set(true);

    this.apiService
      .getAll<Chat>("chats", {
        filter: { todo_id: todoId, before: timestamp },
        visibility: "private",
      })
      .subscribe({
        next: (olderChats) => {
          const nonDeleted = olderChats.filter((c) => !c.deleted_at);
          this.cacheUsernames(nonDeleted);
          if (nonDeleted.length === 0) {
            this.hasMoreMessages.set(false);
          } else {
            const reversed = [...nonDeleted].reverse();
            this.messages.update((current) => [...reversed, ...current]);
            this.oldestTimestamp.set(nonDeleted[nonDeleted.length - 1].created_at);
          }
          this.loadingOlder.set(false);
        },
        error: () => {
          this.loadingOlder.set(false);
        },
      });
  }

  onChatScroll(event: Event) {
    const element = event.target as HTMLElement;
    if (element.scrollTop === 0 && this.hasMoreMessages() && !this.loadingOlder()) {
      this.loadOlderChats(this.currentTodoId);
    }
  }

  handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
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

  isMyMessage(chat: Chat): boolean {
    return chat.user_id === this.authService.getValueByKey("id");
  }

  isRead(chat: Chat): boolean {
    const userId = this.authService.getValueByKey("id");
    return !!chat.read_by && chat.read_by.includes(userId);
  }

  getUnreadCount(): number {
    const currentUserId = this.authService.getValueByKey("id");
    const chats = this.chats().filter((c: Chat) => !c.deleted_at);
    return chats.filter((c: Chat) => !c.read_by || !c.read_by.includes(currentUserId)).length;
  }

  isOwner(): boolean {
    const currentUserId = this.authService.getValueByKey("id");
    const todo = this.currentTodo();
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

    const todo = this.currentTodo();
    const visibility = todo?.visibility === "shared" ? "shared" : "private";

    this.apiService.create<Chat>("chats", chatForBackend, { visibility }).subscribe({
      next: (newChat) => {
        this.newMessage = "";
        this.shouldScroll.set(true);
        this.forceScrollBottom = true;
        this.messages.update((current) => [...current, newChat]);
        setTimeout(() => this.updateObservedElements(".unread-chat", "data-chat-id"), 500);
      },
      error: (err) => {
        console.error("Failed to send message:", err);
      },
    });
  }

  deleteMessage(chatId: string) {
    const todo = this.currentTodo();
    const visibility = todo?.visibility === "shared" ? "shared" : "private";
    this.apiService.delete("chats", chatId, { visibility }).subscribe({
      next: () => {
        this.messages.update((current) => current.filter((c) => c.id !== chatId));
      },
      error: (err) => {
        console.error("Failed to delete message:", err);
      },
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

    return this.apiService.updateAll<Chat>("chats", unreadChats, {
      visibility: "private",
      parentTodoId: todo_id,
    } as any);
  }

  async clearChat() {
    const confirmed = await this.confirmDialogService.confirm({
      title: "Clear Chat",
      message: "Are you sure you want to clear all messages from this chat?",
      confirmText: "Clear",
      confirmClass: "bg-red-600 hover:bg-red-700",
    });
    if (!confirmed) return;

    const chats = this.chats();
    if (!chats || chats.length === 0) return;

    const chatsToDelete = chats.map((chat) => ({ ...chat, deleted_at: new Date().toISOString() }));
    this.apiService.updateAll("chats", chatsToDelete, { visibility: "private" }).subscribe({
      next: () => {
        this.messages.set([]);
      },
    });
  }

  getUsername(userId: string): string {
    return this.usernameCache.get(userId) || "Unknown";
  }

  canDelete(chat: Chat): boolean {
    const currentUserId = this.authService.getValueByKey("id");
    const todo = this.currentTodo();
    if (todo && todo.user_id === currentUserId) return true;
    return chat.user_id === currentUserId;
  }
}
