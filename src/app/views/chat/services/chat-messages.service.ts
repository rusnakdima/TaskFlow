import { Injectable, inject, OnDestroy } from "@angular/core";
import { Observable } from "rxjs";
import { ChatState } from "../state/chat.state";
import { ApiService } from "@services/api.service";
import { AuthService } from "@services/auth/auth.service";
import { UnifiedStorageService } from "@services/core/unified-storage.service";
import { NotifyService } from "@services/notifications/notify.service";
import { Chat, Profile } from "@models/generated/api.types";
import { ChatMessage } from "@models/chat.model";
import { getProfileDisplayName } from "@utils/display-name.util";
import { LoggerService } from "@shared/services/logger.service";

@Injectable({ providedIn: "root" })
export class ChatMessagesService implements OnDestroy {
  private requestService = inject(ApiService);
  private authService = inject(AuthService);
  private storageService = inject(UnifiedStorageService);
  private notifyService = inject(NotifyService);
  state = inject(ChatState);
  private onlineHandler: (() => void) | null = null;
  private loggingService = inject(LoggerService);

  ngOnDestroy(): void {
    if (this.onlineHandler && typeof window !== "undefined") {
      window.removeEventListener("online", this.onlineHandler);
      this.onlineHandler = null;
    }
  }

  loadMessagesForRoom(roomId: string, skip = 0, limit = 100): void {
    this.requestService
      .invokeCommand("get_messages_by_room", {
        roomId: roomId,
        skip: skip,
        limit: limit,
        token: this.authService.getToken(),
      })
      .subscribe({
        next: (result: any) => {
          const currentUserId = this.state.currentUserId();
          const msgs: ChatMessage[] = [];

          const data = Array.isArray(result) ? result : result.data || [];

          for (const chat of data) {
            if (chat.deleted_at) continue;

            const sender = chat.sender || {};
            const profile = sender.profile || {};
            const senderName = profile.name
              ? `${profile.name}${profile.last_name ? " " + profile.last_name : ""}`
              : chat.sender_name || chat.sender_id || "Unknown";
            const senderAvatar = profile.image_url || chat.sender_avatar || null;

            let readStatus: "sent" | "delivered" | "read" | undefined;
            if (chat.sender_id === currentUserId) {
              const readByArr: string[] = chat.read_by || [];
              const otherReaders = readByArr.filter((id: string) => id !== currentUserId);
              if (otherReaders.length === 0) {
                readStatus = "sent";
              } else {
                readStatus = "read";
              }
            }

            msgs.push({
              id: chat.id,
              content: chat.content,
              senderId: chat.sender_id,
              senderName: senderName,
              senderAvatar: senderAvatar,
              time: this.state.formatDate(chat.created_at) || new Date().toISOString(),
              isMine: chat.sender_id === currentUserId,
              isEdited: chat.is_edited === true,
              readStatus: readStatus,
              replyId: chat.reply_id || null,
              reactions: (chat.reactions || []).map((r: any) => ({
                emoji: r.emoji,
                count: r.count,
                isOwn: (r.user_ids || []).includes(currentUserId),
                user_ids: r.user_ids || [],
              })),
            });
          }

          this.state.messages.set(msgs);
          this.populateReplyChain(msgs);
        },
        error: () => {
          this.state.messages.set([]);
        },
      });
  }

  loadPreviousMessagesForRoom(
    roomId: string,
    skip: number,
    limit: number = 100
  ): Observable<ChatMessage[]> {
    return new Observable<ChatMessage[]>((subscriber) => {
      this.requestService
        .invokeCommand("get_messages_by_room", {
          roomId: roomId,
          skip: skip,
          limit: limit,
          token: this.authService.getToken(),
        })
        .subscribe({
          next: (result: any) => {
            const currentUserId = this.state.currentUserId();
            const msgs: ChatMessage[] = [];

            const data = Array.isArray(result) ? result : result.data || [];

            for (const chat of data) {
              if (chat.deleted_at) continue;

              const sender = chat.sender || {};
              const profile = sender.profile || {};
              const senderName = profile.name
                ? `${profile.name}${profile.last_name ? " " + profile.last_name : ""}`
                : chat.sender_name || chat.sender_id || "Unknown";
              const senderAvatar = profile.image_url || chat.sender_avatar || null;

              let readStatus: "sent" | "delivered" | "read" | undefined;
              if (chat.sender_id === currentUserId) {
                const readByArr: string[] = chat.read_by || [];
                const otherReaders = readByArr.filter((id: string) => id !== currentUserId);
                if (otherReaders.length === 0) {
                  readStatus = "sent";
                } else {
                  readStatus = "read";
                }
              }

              msgs.push({
                id: chat.id,
                content: chat.content,
                senderId: chat.sender_id,
                senderName: senderName,
                senderAvatar: senderAvatar,
                time: this.state.formatDate(chat.created_at) || new Date().toISOString(),
                isMine: chat.sender_id === currentUserId,
                isEdited: chat.is_edited === true,
                readStatus: readStatus,
                replyId: chat.reply_id || null,
                reactions: (chat.reactions || []).map((r: any) => ({
                  emoji: r.emoji,
                  count: r.count,
                  isOwn: (r.user_ids || []).includes(currentUserId),
                  user_ids: r.user_ids || [],
                })),
              });
            }

            this.populateReplyChain(msgs);
            subscriber.next(msgs);
            subscriber.complete();
          },
          error: (err) => {
            subscriber.error(err);
            subscriber.complete();
          },
        });
    });
  }

  private populateReplyChain(msgs: ChatMessage[]): void {
    const msgMap = new Map(msgs.map((m) => [m.id, m]));
    msgs.forEach((msg) => {
      if (msg.replyId) {
        msg.replyTo = msgMap.get(msg.replyId) || null;
      }
    });
  }

  sendMessage(content: string): void {
    const conv = this.state.activeConversation();
    if (!content || !conv) return;

    const userId = this.state.currentUserId();
    if (!userId) return;

    const replyId = this.state.replyToMessage()?.id || null;
    const tempId = `temp_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const localChat: Chat = {
      id: tempId,
      room_id: conv.roomId,
      sender_id: userId,
      user_id: userId,
      content: content,
      read_by: [userId],
      created_at: now,
      sync_status: "pending",
      temp_id: tempId,
    };
    this.storageService.addChat(localChat);

    const uiMsg: ChatMessage = {
      id: tempId,
      content: content,
      senderId: userId,
      senderName: this.authService.getValueByKey("username") || "You",
      senderAvatar: undefined,
      time: now,
      isMine: true,
      syncStatus: "pending",
      tempId: tempId,
      replyId: replyId,
    };
    this.state.messages.update((msgs) => [...msgs, uiMsg]);

    this.state.messageInput.set("");
    this.state.replyToMessage.set(null);
    this.updateConversationLastMessage(conv.roomId, content);

    const messagePayload: any = {
      roomId: conv.roomId,
      senderId: userId,
      dmName: conv.name,
      content: content,
      replyId: replyId,
      token: this.authService.getToken(),
    };
    if (conv.otherUserId) {
      messagePayload.receiverId = conv.otherUserId;
    }
    this.requestService.invokeCommand("send_message", messagePayload).subscribe({
      next: (response: any) => {
        const cloudId = response?.id || response?.chat?.id || tempId;
        this.storageService.updateChatByTempId(tempId, cloudId, "synced");
        this.state.messages.update((msgs) =>
          msgs.map((m) =>
            m.tempId === tempId ? { ...m, id: cloudId, syncStatus: "synced" as const } : m
          )
        );
        this.reloadChatsFromApi();
      },
      error: (err) => {
        this.storageService.updateChatSyncStatus(tempId, "failed");
        this.state.messages.update((msgs) =>
          msgs.map((m) =>
            m.tempId === tempId
              ? { ...m, syncStatus: "failed" as const, lastError: err.message }
              : m
          )
        );
        this.queueChatMessageForSync(tempId, conv, content, replyId, err.message);
        this.notifyService.showError("Message saved offline. Will sync when online.");
      },
    });
  }

  private queueChatMessageForSync(
    tempId: string,
    conv: any,
    content: string,
    replyId: string | null,
    lastError?: string
  ): void {
    const queuedOp = {
      id: tempId,
      operation: "create" as const,
      table: "chats",
      data: {
        id: tempId,
        room_id: conv.roomId,
        sender_id: this.state.currentUserId(),
        user_id: this.state.currentUserId(),
        receiver_id: conv.otherUserId,
        dm_name: conv.name,
        content: content,
        reply_id: replyId,
        created_at: new Date().toISOString(),
        sync_status: "pending",
        temp_id: tempId,
      },
      timestamp: Date.now(),
      retries: 0,
      visibility: "private",
      isChatOperation: true,
      lastError: lastError,
    };

    const queue = this.getChatQueue();
    queue.push(queuedOp);
    this.saveChatQueue(queue);
  }

  private getChatQueue(): any[] {
    try {
      const stored = localStorage.getItem("taskflow_chat_offline_queue");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  private saveChatQueue(queue: any[]): void {
    try {
      localStorage.setItem("taskflow_chat_offline_queue", JSON.stringify(queue));
    } catch (error) {
      this.loggingService.error("Failed to save chat queue", error);
    }
  }

  private processChatQueue(): void {
    if (!navigator.onLine) return;

    const queue = this.getChatQueue();
    if (queue.length === 0) return;

    const remaining: any[] = [];

    for (const op of queue) {
      const queuePayload: any = {
        roomId: op.data.room_id,
        senderId: op.data.sender_id,
        dmName: op.data.dm_name,
        content: op.data.content,
        replyId: op.data.reply_id,
        token: this.authService.getToken(),
      };
      if (op.data.receiver_id) {
        queuePayload.receiverId = op.data.receiver_id;
      }
      this.requestService.invokeCommand("send_message", queuePayload).subscribe({
        next: (response: any) => {
          const cloudId = response?.id || response?.chat?.id || op.id;
          this.storageService.updateChatByTempId(op.id, cloudId, "synced");
          this.state.messages.update((msgs) =>
            msgs.map((m) =>
              m.tempId === op.id ? { ...m, id: cloudId, syncStatus: "synced" as const } : m
            )
          );
        },
        error: () => {
          op.retries = (op.retries || 0) + 1;
          if (op.retries < 3) {
            remaining.push(op);
          } else {
            this.storageService.updateChatSyncStatus(op.id, "failed");
            this.state.messages.update((msgs) =>
              msgs.map((m) => (m.tempId === op.id ? { ...m, syncStatus: "failed" as const } : m))
            );
          }
        },
      });
    }

    this.saveChatQueue(remaining);
  }

  retrySendMessage(tempId: string): void {
    const queue = this.getChatQueue();
    const op = queue.find((o) => o.id === tempId);
    if (!op) {
      this.loggingService.warn("retrySendMessage: op not found in queue", { tempId });
      return;
    }

    this.storageService.updateChatSyncStatus(tempId, "pending");
    this.state.messages.update((msgs) =>
      msgs.map((m) => (m.tempId === tempId ? { ...m, syncStatus: "pending" as const } : m))
    );
    const retryPayload: any = {
      roomId: op.data.room_id,
      senderId: op.data.sender_id,
      dmName: op.data.dm_name,
      content: op.data.content,
      replyId: op.data.reply_id,
      token: this.authService.getToken(),
    };
    if (op.data.receiver_id) {
      retryPayload.receiverId = op.data.receiver_id;
    }
    this.requestService.invokeCommand("send_message", retryPayload).subscribe({
      next: (response: any) => {
        const cloudId = response?.id || response?.chat?.id || tempId;
        this.storageService.updateChatByTempId(tempId, cloudId, "synced");
        this.state.messages.update((msgs) =>
          msgs.map((m) =>
            m.tempId === tempId ? { ...m, id: cloudId, syncStatus: "synced" as const } : m
          )
        );
        const newQueue = queue.filter((o) => o.id !== tempId);
        this.saveChatQueue(newQueue);
      },
      error: () => {
        this.storageService.updateChatSyncStatus(tempId, "failed");
        this.state.messages.update((msgs) =>
          msgs.map((m) => (m.tempId === tempId ? { ...m, syncStatus: "failed" as const } : m))
        );
      },
    });
  }

  private reloadChatsFromApi(): void {
    this.requestService
      .getAll<Chat>("chats", {
        visibility: "all",
        limit: 100,
      })
      .subscribe({
        next: (cloudChats) => {
          const localChats = this.storageService.chats();

          const merged: Chat[] = [...localChats];
          const existingIds = new Set(localChats.map((c) => c.id));

          for (const cloudChat of cloudChats) {
            if (!existingIds.has(cloudChat.id)) {
              merged.push(cloudChat);
              existingIds.add(cloudChat.id);
            }
          }

          this.storageService.setChats(merged);
        },
        error: () => {},
      });
  }

  private updateConversationLastMessage(roomId: string, message: string): void {
    const timeNow = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    this.state.conversations.update((convs) =>
      convs.map((c) =>
        c.roomId === roomId ? { ...c, lastMessage: message, lastMessageTime: timeNow } : c
      )
    );
  }

  saveEditMessage(): void {
    const msgId = this.state.editingMessageId();
    const content = this.state.editingMessageContent().trim();
    if (!msgId || !content) {
      this.state.cancelEditMessage();
      return;
    }

    this.requestService
      .invokeCommand("edit_message", {
        id: msgId,
        content: content,
        token: this.authService.getToken(),
      })
      .subscribe({
        next: () => {
          this.state.messages.update((msgs) =>
            msgs.map((m) => (m.id === msgId ? { ...m, content: content, isEdited: true } : m))
          );
          this.state.cancelEditMessage();
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to edit message");
          this.state.cancelEditMessage();
        },
      });
  }

  deleteMessage(): void {
    const msg = this.state.contextMenuMessage();
    if (!msg) return;

    this.requestService
      .invokeCommand("hard_delete_message", {
        id: msg.id,
        token: this.authService.getToken(),
      })
      .subscribe({
        next: () => {
          this.state.messages.update((msgs) => msgs.filter((m) => m.id !== msg.id));
          this.state.closeMessageContextMenu();
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to delete message");
          this.state.closeMessageContextMenu();
        },
      });
  }

  deleteMessageById(messageId: string): void {
    this.loggingService.debug("deleteMessageById", { messageId });
    this.requestService
      .invokeCommand("hard_delete_message", {
        id: messageId,
        token: this.authService.getToken(),
      })
      .subscribe({
        next: () => {
          this.state.messages.update((msgs) => msgs.filter((m) => m.id !== messageId));
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to delete message");
        },
      });
  }

  initChatQueueListener(): void {
    this.onlineHandler = () => {
      this.processChatQueue();
    };
    window.addEventListener("online", this.onlineHandler);

    if (navigator.onLine) {
      this.processChatQueue();
    }
  }
}
