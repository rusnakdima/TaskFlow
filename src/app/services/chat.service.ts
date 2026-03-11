/* sys lib */
import { Injectable, inject, signal, computed } from "@angular/core";
import { Observable, tap, of } from "rxjs";

/* models */
import { Chat, ChatCreate } from "@models/chat.model";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

/* services */
import { JwtTokenService } from "@services/jwt-token.service";
import { StorageService } from "@services/storage.service";

@Injectable({
  providedIn: "root",
})
export class ChatService {
  private dataSync = inject(DataSyncProvider);
  private jwtTokenService = inject(JwtTokenService);
  public storageService = inject(StorageService);

  private chatsSignal = signal<Chat[]>([]);
  private activeTodoIdSignal = signal<string | null>(null);
  private unreadCountsSignal = signal<Map<string, number>>(new Map());

  get chats() {
    return this.chatsSignal.asReadonly();
  }

  get unreadCounts() {
    return this.unreadCountsSignal.asReadonly();
  }

  totalUnreadCount = computed(() => {
    let total = 0;
    this.unreadCountsSignal().forEach((count) => (total += count));
    return total;
  });

  constructor() {
    this.initWebSocketListeners();
  }

  private initWebSocketListeners(): void {
    window.addEventListener("ws-chat-created", (event: any) => this.onChatCreated(event.detail));
    window.addEventListener("ws-chat-updated", (event: any) => this.onChatUpdated(event.detail));
    window.addEventListener("ws-chat-deleted", (event: any) => this.onChatDeleted(event.detail.id));
    window.addEventListener("ws-chat-cleared", (event: any) =>
      this.onChatCleared(event.detail.todoId)
    );
  }

  private onChatCreated(chat: Chat): void {
    const activeTodoId = this.activeTodoIdSignal();

    if (activeTodoId === chat.todoId) {
      if (this.chatsSignal().some((c) => c.id === chat.id)) return;
      this.chatsSignal.update((chats) => [...chats, chat]);
    } else {
      const token = localStorage.getItem("token") || sessionStorage.getItem("token");
      const currentUserId = this.jwtTokenService.getUserId(token);
      if (chat.userId !== currentUserId) {
        this.unreadCountsSignal.update((counts) => {
          const newMap = new Map(counts);
          newMap.set(chat.todoId, (newMap.get(chat.todoId) || 0) + 1);
          return newMap;
        });
      }
    }
  }

  private onChatUpdated(chat: Chat): void {
    this.chatsSignal.update((chats) => chats.map((c) => (c.id === chat.id ? chat : c)));
  }

  private onChatDeleted(id: string): void {
    this.chatsSignal.update((chats) => chats.filter((c) => c.id !== id));
  }

  private onChatCleared(todoId: string): void {
    if (this.activeTodoIdSignal() === todoId) {
      this.chatsSignal.set([]);
    }
  }

  loadChats(todoId: string): Observable<Chat[]> {
    this.activeTodoIdSignal.set(todoId);

    this.unreadCountsSignal.update((counts) => {
      const newMap = new Map(counts);
      newMap.delete(todoId);
      return newMap;
    });

    return this.dataSync
      .getAll<Chat>("chats", { todoId, isDeleted: false }, undefined, todoId)
      .pipe(
        tap((chats) =>
          this.chatsSignal.set(
            chats.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          )
        )
      );
  }

  closeChat(): void {
    this.activeTodoIdSignal.set(null);
  }

  getUnreadCount(todoId: string): number {
    return this.unreadCountsSignal().get(todoId) || 0;
  }

  addMessage(todoId: string, content: string): Observable<Chat> {
    const token = localStorage.getItem("token") || sessionStorage.getItem("token");
    const currentUserId = this.jwtTokenService.getUserId(token) || "";
    const username = this.jwtTokenService.getValueByKey(token, "username") || "User";

    const chatData: ChatCreate = {
      todoId,
      userId: currentUserId,
      authorName: username,
      content,
    };

    return this.dataSync.create<Chat>("chats", chatData, undefined, todoId).pipe(
      tap((chat) => {
        if (this.activeTodoIdSignal() === todoId) {
          if (!this.chatsSignal().some((c) => c.id === chat.id)) {
            this.chatsSignal.update((chats) => [...chats, chat]);
          }
        }
      })
    );
  }

  deleteMessage(chatId: string, todoId: string): Observable<void> {
    return this.dataSync.delete("chats", chatId, undefined, todoId);
  }

  markAsRead(todoId: string, ids?: string[]): Observable<Chat[]> {
    const token = localStorage.getItem("token") || sessionStorage.getItem("token");
    const currentUserId = this.jwtTokenService.getUserId(token) || "";
    const unreadChats = this.chatsSignal()
      .filter(
        (chat) =>
          (!ids || ids.includes(chat.id)) && (!chat.readBy || !chat.readBy.includes(currentUserId))
      )
      .map((chat) => ({
        ...chat,
        readBy: [...(chat.readBy || []), currentUserId],
      }));

    if (unreadChats.length === 0) return of([]);

    return this.dataSync.updateAll<Chat>("chats", unreadChats, undefined, todoId).pipe(
      tap((updatedChats) => {
        this.chatsSignal.update((chats) =>
          chats.map((c) => {
            const updated = updatedChats.find((u) => u.id === c.id);
            return updated ? updated : c;
          })
        );
      })
    );
  }

  clearChat(todoId: string): Observable<Chat[]> {
    const chatsToDelete = this.chatsSignal().map((chat) => ({ ...chat, isDeleted: true }));
    return this.dataSync
      .updateAll<Chat>("chats", chatsToDelete, undefined, todoId)
      .pipe(tap(() => this.chatsSignal.set([])));
  }

  canDelete(chat: Chat): boolean {
    const token = localStorage.getItem("token") || sessionStorage.getItem("token");
    const currentUserId = this.jwtTokenService.getUserId(token);
    const todo = this.storageService.getTodoById(chat.todoId);
    if (todo && todo.userId === currentUserId) return true;
    return chat.userId === currentUserId;
  }
}
