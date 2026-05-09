import { Injectable, inject, computed } from "@angular/core";
import { StorageStateService } from "./storage-state.service";
import { Chat } from "@models/chat.model";
import { Task } from "@models/task.model";
import { DEFAULT_CACHE_TTL_MS } from "@helpers/index";

const MAX_CACHE_SIZE = 100;

@Injectable({ providedIn: "root" })
export class StorageChatService {
  private state = inject(StorageStateService);

  getChatsByTodoReactive(todo_id?: string): ReturnType<typeof computed<Chat[]>> {
    if (!todo_id) return computed(() => []);

    const now = Date.now();
    const cached = this.state.chatsCache.get(todo_id);
    const timestamp = this.state.cacheTimestamps.get(`chats_${todo_id}`);

    if (cached && timestamp && now - timestamp < DEFAULT_CACHE_TTL_MS) {
      return cached;
    }

    if (this.state.chatsCache.size >= MAX_CACHE_SIZE) {
      this.evictOldestCache("chats_");
    }

    const computedSignal = computed(() => {
      return this.state.chats().filter((chat) => chat.todo_id === todo_id);
    });

    this.state.chatsCache.set(todo_id, computedSignal);
    this.state.cacheTimestamps.set(`chats_${todo_id}`, now);
    return computedSignal;
  }

  getTasksByTodoReactive(todo_id?: string): ReturnType<typeof computed<Task[]>> {
    if (!todo_id) return computed(() => []);

    const now = Date.now();
    const cached = this.state.tasksByTodoCache.get(todo_id);
    const timestamp = this.state.cacheTimestamps.get(`tasks_${todo_id}`);

    if (cached && timestamp && now - timestamp < DEFAULT_CACHE_TTL_MS) {
      return cached;
    }

    if (this.state.tasksByTodoCache.size >= MAX_CACHE_SIZE) {
      this.evictOldestCache("tasks_");
    }

    const computedSignal = computed(() => {
      return this.state.tasks().filter((task) => task.todo_id === todo_id);
    });

    this.state.tasksByTodoCache.set(todo_id, computedSignal);
    this.state.cacheTimestamps.set(`tasks_${todo_id}`, now);
    return computedSignal;
  }

  private evictOldestCache(prefix: string): void {
    const sortedKeys = Array.from(this.state.cacheTimestamps.entries())
      .filter(([key]) => key.startsWith(prefix))
      .sort((a, b) => a[1] - b[1])
      .slice(0, this.state.chatsCache.size - MAX_CACHE_SIZE + 1)
      .map(([key]) => key);
    for (const key of sortedKeys) {
      const id = key.replace(prefix, "");
      if (prefix === "chats_") {
        this.state.chatsCache.delete(id);
      } else if (prefix === "tasks_") {
        this.state.tasksByTodoCache.delete(id);
      }
      this.state.cacheTimestamps.delete(key);
    }
  }

  setChatsByTodo(chats: Chat[], todo_id?: string): void {
    if (!todo_id) return;
    this.state._chats.update((existing) => {
      const filtered = existing.filter((c) => c.todo_id !== todo_id);
      return [...filtered, ...chats];
    });
  }

  addChatToTodo(chat: Chat, todo_id?: string): void {
    if (!todo_id) return;
    this.state._chats.update((chats) => {
      if (chats.some((c) => c.id === chat.id)) return chats;
      return [...chats, chat];
    });
  }

  updateChatInTodo(chat: Chat, todo_id?: string): void {
    if (!todo_id) return;
    this.state._chats.update((chats) =>
      chats.map((c) => (c.id === chat.id ? { ...c, ...chat } : c))
    );
  }

  deleteChatFromTodo(chatId: string, todo_id?: string): void {
    if (!todo_id) return;
    this.state._chats.update((chats) =>
      chats.filter((c) => !(c.id === chatId && c.todo_id === todo_id))
    );
  }

  clearChatsByTodo(todo_id?: string): void {
    if (!todo_id) return;
    this.state._chats.update((chats) => chats.filter((c) => c.todo_id !== todo_id));
  }

  bulkUpsertSubtasks(subtasks: any[]): void {
    this.state._subtasks.update((existing) => {
      const subtaskMap = new Map(existing.map((s) => [s.id, s]));
      for (const subtask of subtasks) {
        subtaskMap.set(subtask.id, { ...subtaskMap.get(subtask.id), ...subtask });
      }
      return Array.from(subtaskMap.values());
    });
  }
}
