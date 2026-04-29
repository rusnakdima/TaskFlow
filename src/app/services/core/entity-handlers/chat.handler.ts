import { WritableSignal } from "@angular/core";
import { EntityHandler } from "./entity-handler.base";
import { Chat } from "@models/chat.model";

export class ChatHandler extends EntityHandler<Chat> {
  constructor(private signal: WritableSignal<Map<string, Chat[]>>) {
    super();
  }

  add(data: Chat): void {
    this.signal.update((map) => {
      const newMap = new Map(map);
      const chats = newMap.get(data.todo_id) || [];
      if (!chats.some((c) => c.id === data.id)) {
        newMap.set(data.todo_id, [...chats, data]);
      }
      return newMap;
    });
  }

  update(id: string, updates: Partial<Chat>, _resolvers?: Record<string, any>): void {
    this.signal.update((map) => {
      const newMap = new Map(map);
      for (const [todoId, chats] of newMap.entries()) {
        const chatIndex = chats.findIndex((c) => c.id === id);
        if (chatIndex !== -1) {
          const updatedChats = [...chats];
          updatedChats[chatIndex] = { ...chats[chatIndex], ...updates };
          newMap.set(todoId, updatedChats);
          break;
        }
      }
      return newMap;
    });
  }

  setByTodoId(chats: Chat[], todo_id?: string): void {
    if (!todo_id) return;
    this.signal.update((map) => {
      const newMap = new Map(map);
      newMap.set(todo_id, chats);
      return newMap;
    });
  }

  remove(id: string): void {
    this.signal.update((map) => {
      const newMap = new Map(map);
      for (const [todoId, chats] of newMap.entries()) {
        const filtered = chats.filter((c) => c.id !== id);
        if (filtered.length !== chats.length) {
          newMap.set(todoId, filtered);
          break;
        }
      }
      return newMap;
    });
  }

  getById(id: string): Chat | undefined {
    for (const chats of this.signal().values()) {
      const chat = chats.find((c) => c.id === id);
      if (chat) return chat;
    }
    return undefined;
  }
}
