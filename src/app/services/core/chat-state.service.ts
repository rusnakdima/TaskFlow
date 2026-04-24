/* sys lib */
import { Injectable, signal, computed } from "@angular/core";
/* models */
import { Chat } from "@models/chat.model";
import { ChatHandler } from "./entity-handlers/chat.handler";

@Injectable({ providedIn: "root" })
export class ChatStateService {
  readonly chatsByTodoSignal = signal<Map<string, Chat[]>>(new Map());
  readonly chatsByTodo = this.chatsByTodoSignal.asReadonly();

  private readonly handler = new ChatHandler(this.chatsByTodoSignal);

  getChatsByTodo(todo_id?: string): Chat[] {
    if (!todo_id) return [];
    return this.chatsByTodoSignal().get(todo_id) || [];
  }

  getChatsByTodoReactive(todo_id?: string): ReturnType<typeof computed<Chat[]>> {
    return computed(() => {
      if (!todo_id) return [];
      return this.chatsByTodoSignal().get(todo_id) || [];
    });
  }

  setChatsByTodo(chats: Chat[], todo_id?: string): void {
    if (!todo_id) return;
    this.handler.setByTodoId(chats, todo_id);
  }

  addChatToTodo(chat: Chat, todo_id?: string): void {
    if (!todo_id) return;
    this.chatsByTodoSignal.update((map) => {
      const newMap = new Map(map);
      const chats = newMap.get(todo_id) || [];
      if (!chats.some((c) => c.id === chat.id)) {
        newMap.set(todo_id, [chat, ...chats]);
      }
      return newMap;
    });
  }

  updateChatInTodo(chat: Chat, todo_id?: string): void {
    if (!todo_id) return;
    this.chatsByTodoSignal.update((map) => {
      const newMap = new Map(map);
      for (const [tid, chats] of newMap.entries()) {
        if (tid === todo_id) {
          const updatedChats = chats.map((c) => (c.id === chat.id ? { ...c, ...chat } : c));
          newMap.set(tid, updatedChats);
          break;
        }
      }
      return newMap;
    });
  }

  deleteChatFromTodo(chatId: string, todo_id?: string): void {
    if (!todo_id) return;
    this.chatsByTodoSignal.update((map) => {
      const newMap = new Map(map);
      const chats = newMap.get(todo_id) || [];
      const filtered = chats.filter((c) => c.id !== chatId);
      if (filtered.length !== chats.length) {
        newMap.set(todo_id, filtered);
      }
      return newMap;
    });
  }

  clearChatsByTodo(todo_id?: string): void {
    if (!todo_id) return;
    this.chatsByTodoSignal.update((map) => {
      const newMap = new Map(map);
      newMap.delete(todo_id);
      return newMap;
    });
  }
}
