/* sys lib */
import { Injectable, inject } from "@angular/core";
import { Observable, of } from "rxjs";

/* models */
import { Chat, ChatCreate } from "@models/chat.model";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

/* services */
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { StorageService } from "@services/core/storage.service";

@Injectable({
  providedIn: "root",
})
export class ChatService {
  private dataSync = inject(DataSyncProvider);
  private jwtTokenService = inject(JwtTokenService);
  private storageService = inject(StorageService);

  constructor() {
    this.initWebSocketListeners();
  }

  private initWebSocketListeners(): void {
    window.addEventListener("ws-chat-created", (event: any) => this.onChatCreated(event.detail));
    window.addEventListener("ws-chat-updated", (event: any) => this.onChatUpdated(event.detail));
    window.addEventListener("ws-chat-deleted", (event: any) => this.onChatDeleted(event.detail));
    window.addEventListener("ws-chat-cleared", (event: any) =>
      this.onChatCleared(event.detail)
    );
  }

  private onChatCreated(chat: Chat): void {
    this.storageService.addChatToTodo(chat.todoId, chat);
  }

  private onChatUpdated(chat: Chat): void {
    this.storageService.updateChatInTodo(chat.todoId, chat);
  }

  private onChatDeleted(chat: { id: string; todoId: string }): void {
    this.storageService.deleteChatFromTodo(chat.todoId, chat.id);
  }

  private onChatCleared(todoId: string): void {
    this.storageService.clearChatsByTodo(todoId);
  }

  /**
   * Get chats for a todo from storage
   */
  getChats(todoId: string): Chat[] {
    return this.storageService.getChatsByTodo(todoId);
  }

  /**
   * Load chats from backend and store in StorageService
   */
  loadChats(todoId: string): Observable<Chat[]> {
    return this.dataSync.crud<Chat[]>("getAll", "chats", { filter: { todoId, isDeleted: false }, parentTodoId: todoId }, true);
  }

  /**
   * Add a new chat message
   */
  addMessage(todoId: string, content: string): Observable<Chat> {
    const token = localStorage.getItem("token") || sessionStorage.getItem("token");
    const currentUserId = this.jwtTokenService.getUserId(token) || "";
    const username = this.jwtTokenService.getValueByKey(token, "username") || "User";

    const chatForBackend: ChatCreate = {
      todoId,
      userId: currentUserId,
      authorName: username,
      content,
    };

    return this.dataSync.crud<Chat>("create", "chats", { data: chatForBackend, parentTodoId: todoId });
  }

  /**
   * Delete a chat message
   */
  deleteMessage(chatId: string, todoId: string): Observable<unknown> {
    return this.dataSync.crud("delete", "chats", { id: chatId, parentTodoId: todoId });
  }

  /**
   * Mark chats as read
   */
  markAsRead(todoId: string, ids?: string[]): Observable<Chat[]> {
    const token = localStorage.getItem("token") || sessionStorage.getItem("token");
    const currentUserId = this.jwtTokenService.getUserId(token) || "";
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

  /**
   * Clear all chats for a todo
   */
  clearChat(todoId: string): Observable<Chat[]> {
    const chats = this.storageService.getChatsByTodo(todoId);
    const chatsToDelete = chats.map((chat) => ({ ...chat, isDeleted: true }));
    return this.dataSync.crud<Chat[]>("updateAll", "chats", { data: chatsToDelete, parentTodoId: todoId }, true);
  }

  /**
   * Check if current user can delete a chat
   */
  canDelete(chat: Chat): boolean {
    const token = localStorage.getItem("token") || sessionStorage.getItem("token");
    const currentUserId = this.jwtTokenService.getUserId(token);
    const todo = this.storageService.getTodoById(chat.todoId);
    if (todo && todo.userId === currentUserId) return true;
    return chat.userId === currentUserId;
  }
}
