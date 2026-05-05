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

/* services */
import { AuthService } from "@services/auth/auth.service";
import { DataService } from "@services/data/data.service";

/* providers */
import { ApiProvider } from "@providers/api.provider";

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

  dataSync = inject(ApiProvider);
  authService = inject(AuthService);
  dataService = inject(DataService);
  private destroyRef = inject(DestroyRef);

  chats = signal<Chat[]>([]);

  messages = signal<Chat[]>([]);
  hasMoreMessages = signal(true);
  loadingOlder = signal(false);
  loadingInitial = signal(false);
  oldestTimestamp = signal<string | null>(null);
  currentTodoId = "";

  private subscriptions = new Subscription();
  private currentTodo = signal<any>(null);
  private usernameCache = new Map<string, string>();

  private chatReactiveEffect = effect(() => {
    this.subscriptions.add(
      this.dataService.getChats(this.todo_id).subscribe({
        next: (chats) => this.chats.set(chats),
        error: () => this.chats.set([]),
      })
    );
  });

  newMessage = "";
  private forceScrollBottom = false;

  ngOnChanges(changes: SimpleChanges) {
    if (changes["todo_id"] && !changes["todo_id"].isFirstChange()) {
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
      this.dataService.getTodo(this.todo_id).subscribe({
        next: (todo) => this.currentTodo.set(todo),
        error: () => this.currentTodo.set(null),
      })
    );
  }

  private loadInitialChats(todoId: string) {
    if (this.loadingInitial()) return;
    this.loadingInitial.set(true);

    this.dataSync
      .crud<Chat[]>("get", "chats", { filter: { todo_id: todoId }, load: ["user"] })
      .subscribe({
        next: (chats) => {
          const reversed = [...chats].reverse();
          this.messages.set(reversed);
          this.cacheUsernames(chats);
          if (chats.length > 0) {
            this.oldestTimestamp.set(chats[chats.length - 1].created_at);
            this.hasMoreMessages.set(chats.length >= 10);
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

    this.dataSync
      .crud<Chat[]>("get", "chats", { filter: { todo_id: todoId, before: timestamp } })
      .subscribe({
        next: (olderChats) => {
          this.cacheUsernames(olderChats);
          if (olderChats.length === 0) {
            this.hasMoreMessages.set(false);
          } else {
            const reversed = [...olderChats].reverse();
            this.messages.update((current) => [...reversed, ...current]);
            this.oldestTimestamp.set(olderChats[olderChats.length - 1].created_at);
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

    this.dataSync
      .crud<Chat>("create", "chats", {
        data: chatForBackend,
        parentTodoId: this.todo_id,
        visibility,
      })
      .subscribe(() => {
        this.newMessage = "";
        this.shouldScroll.set(true);
        this.forceScrollBottom = true;
        setTimeout(() => this.updateObservedElements(".unread-chat", "data-chat-id"), 500);
      });
  }

  deleteMessage(chatId: string) {
    this.dataSync.crud("delete", "chats", { id: chatId, parentTodoId: this.todo_id }).subscribe({
      error: (err) => {},
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
    return this.usernameCache.get(userId) || "Unknown";
  }

  canDelete(chat: Chat): boolean {
    const currentUserId = this.authService.getValueByKey("id");
    const todo = this.currentTodo();
    if (todo && todo.user_id === currentUserId) return true;
    return chat.user_id === currentUserId;
  }
}
