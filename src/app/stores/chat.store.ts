/**
 * Chat Store - Manages chat state using Angular signals
 *
 * Chats are grouped by todoId for efficient access
 */

import { Injectable, signal, computed, Signal, WritableSignal } from "@angular/core";
import { Chat } from "@models/chat.model";
import {
  addEntityToArray,
  removeEntityFromArray,
  updateEntityInArray,
  findById,
} from "./utils/store-helpers";

interface ChatState {
  chatsByTodo: Map<string, Chat[]>;
  loading: boolean;
  loaded: boolean;
  lastLoaded: Date | null;
}

const initialState: ChatState = {
  chatsByTodo: new Map(),
  loading: false,
  loaded: false,
  lastLoaded: null,
};

@Injectable({
  providedIn: "root",
})
export class ChatStore {
  private readonly state: WritableSignal<ChatState> = signal(initialState);

  readonly chatsByTodo: Signal<Map<string, Chat[]>> = computed(() => this.state().chatsByTodo);
  readonly loading: Signal<boolean> = computed(() => this.state().loading);
  readonly loaded: Signal<boolean> = computed(() => this.state().loaded);
  readonly lastLoaded: Signal<Date | null> = computed(() => this.state().lastLoaded);

  /**
   * Get chats for a specific todo
   */
  chatsByTodoId(todo_id?: string): Signal<Chat[]> {
    return computed(() => this.state().chatsByTodo.get(todoId) || []);
  }

  /**
   * Get chat by ID
   */
  chatById(id: string): Chat | undefined {
    for (const chats of this.state().chatsByTodo.values()) {
      const chat = findById(chats, id);
      if (chat) return chat;
    }
    return undefined;
  }

  /**
   * Get all chats (flattened)
   */
  readonly allChats: Signal<Chat[]> = computed(() => {
    const allChats: Chat[] = [];
    for (const chats of this.state().chatsByTodo.values()) {
      allChats.push(...chats);
    }
    return allChats;
  });

  setLoading(loading: boolean): void {
    this.state.update((state) => ({ ...state, loading }));
  }

  setLoaded(loaded: boolean): void {
    this.state.update((state) => ({
      ...state,
      loaded,
      lastLoaded: loaded ? new Date() : state.lastLoaded,
    }));
  }

  /**
   * Set all chats for a todo
   */
  setChatsByTodoId(todo_id?: string, chats: Chat[]): void {
    this.state.update((state) => {
      const newMap = new Map(state.chatsByTodo);
      newMap.set(todoId, chats);
      return { ...state, chatsByTodo: newMap };
    });
  }

  /**
   * Add a chat to a todo
   */
  addChat(chat: Chat): void {
    this.state.update((state) => {
      const newMap = new Map(state.chatsByTodo);
      const chats = newMap.get(chat.todo_id) || [];
      newMap.set(chat.todo_id, addEntityToArray(chats, chat));
      return { ...state, chatsByTodo: newMap };
    });
  }

  /**
   * Update a chat
   */
  updateChat(id: string, updates: Partial<Chat>): void {
    this.state.update((state) => {
      const newMap = new Map(state.chatsByTodo);
      for (const [todoId, chats] of newMap.entries()) {
        const chatIndex = chats.findIndex((c) => c.id === id);
        if (chatIndex !== -1) {
          const updatedChats = [...chats];
          updatedChats[chatIndex] = { ...chats[chatIndex], ...updates };
          newMap.set(todoId, updatedChats);
          break;
        }
      }
      return { ...state, chatsByTodo: newMap };
    });
  }

  /**
   * Remove a chat
   */
  removeChat(id: string): void {
    this.state.update((state) => {
      const newMap = new Map(state.chatsByTodo);
      for (const [todoId, chats] of newMap.entries()) {
        const filtered = removeEntityFromArray(chats, id);
        if (filtered.length !== chats.length) {
          newMap.set(todoId, filtered);
          break;
        }
      }
      return { ...state, chatsByTodo: newMap };
    });
  }

  /**
   * Clear chats for a specific todo
   */
  clearChatsByTodoId(todo_id?: string): void {
    this.state.update((state) => {
      const newMap = new Map(state.chatsByTodo);
      newMap.delete(todoId);
      return { ...state, chatsByTodo: newMap };
    });
  }

  /**
   * Clear all chats
   */
  clear(): void {
    this.state.set(initialState);
  }
}
