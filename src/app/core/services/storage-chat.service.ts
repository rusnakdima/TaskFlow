/* sys lib */
import { Injectable, inject } from "@angular/core";
import { Observable, of } from "rxjs";
import { tap, catchError, map } from "rxjs/operators";

/* models */
import { Chat, Room } from "@models/generated/api.types";
import { ConversationItem, ChatMessage } from "@models/chat.model";

/* services */
import { ApiService } from "@services/api.service";
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { NotifyService } from "@services/notifications/notify.service";
import { MongoConnectionService } from "@core/services/mongo-connection.service";
import { LoggerService } from "@shared/services/logger.service";

/* base */
import { BaseStorageService } from "./storage-entity.service";

@Injectable({ providedIn: "root" })
export class StorageChatService extends BaseStorageService {
  constructor() {
    super();
  }

  /* ════════════════════════════════════════════════════════════════════════
     CHAT OPERATIONS - Optimistic with offline support
     ════════════════════════════════════════════════════════════════════════ */

  sendMessage(content: string, roomId: string, replyId?: string): Observable<Chat> {
    const userId = this.currentUserId();
    const tempId = `temp_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const localChat: Chat = {
      id: tempId,
      room_id: roomId,
      sender_id: userId,
      user_id: userId,
      content,
      read_by: [userId],
      created_at: now,
      sync_status: "pending",
      temp_id: tempId,
    };
    this.chats.update((chats) => [...chats, localChat]);

    const uiMsg: ChatMessage = {
      id: tempId,
      content,
      senderId: userId,
      senderName: this._jwtTokenService.getUsername(this._jwtTokenService.getToken()) || "You",
      senderAvatar: undefined,
      time: now,
      isMine: true,
      syncStatus: "pending",
      tempId,
      replyId,
    };
    this.messages.update((msgs) => [...msgs, uiMsg]);

    const token = this._jwtTokenService.getToken();
    return this._apiService
      .invokeCommand<any>("send_message", {
        roomId,
        senderId: userId,
        content,
        replyId,
        token,
      })
      .pipe(
        map((response: any) => response?.data || response),
        tap((serverChat: any) => {
          const cloudId = serverChat?.id || serverChat?.chat?.id || tempId;
          this.updateChatByTempId(tempId, cloudId, "synced");
          this.messages.update((msgs) =>
            msgs.map((m) =>
              m.tempId === tempId ? { ...m, id: cloudId, syncStatus: "synced" as const } : m
            )
          );
        }),
        catchError((error) => {
          this.updateChatSyncStatus(tempId, "failed");
          this.messages.update((msgs) =>
            msgs.map((m) => (m.tempId === tempId ? { ...m, syncStatus: "failed" as const } : m))
          );
          this.queueChatMessageForSync(tempId, roomId, content, replyId ?? null, error.message);
          this._notifyService.showError("Message saved offline. Will sync when online.");
          return of(localChat);
        })
      );
  }

  editMessage(messageId: string, content: string): Observable<void> {
    const previousMessages = this.messages();

    this.messages.update((msgs) =>
      msgs.map((m) => (m.id === messageId ? { ...m, content, isEdited: true } : m))
    );

    const token = this._jwtTokenService.getToken();
    return this._apiService
      .invokeCommand<void>("edit_message", { id: messageId, content, token })
      .pipe(
        catchError((error) => {
          this.messages.set(previousMessages);
          this._notifyService.showError(`Failed to edit: ${error.message}`);
          throw error;
        })
      );
  }

  deleteMessage(messageId: string): Observable<void> {
    const previousMessages = this.messages();

    this.messages.update((msgs) => msgs.filter((m) => m.id !== messageId));

    const token = this._jwtTokenService.getToken();
    return this._apiService
      .invokeCommand<void>("hard_delete_message", { id: messageId, token })
      .pipe(
        catchError((error) => {
          this.messages.set(previousMessages);
          this._notifyService.showError(`Failed to delete: ${error.message}`);
          throw error;
        })
      );
  }

  createGroup(name: string): Observable<void> {
    const userId = this.currentUserId();
    const roomId = "group_" + Date.now();

    const token = this._jwtTokenService.getToken();
    return this._apiService
      .invokeCommand<void>("create_group", {
        name,
        roomId,
        ownerId: userId,
        memberIds: [userId],
        token,
      })
      .pipe(
        tap(() => {
          this._notifyService.showSuccess("Group created successfully");
          this.loadGroups();
        }),
        catchError((error) => {
          this._notifyService.showError(`Failed to create group: ${error.message}`);
          throw error;
        })
      );
  }

  addGroupMembers(roomId: string, memberIds: string[]): Observable<void> {
    const token = this._jwtTokenService.getToken();
    return this._apiService
      .invokeCommand<void>("add_group_members", {
        id: roomId,
        memberIds,
        token,
      })
      .pipe(
        tap(() => {
          this.conversations.update((convs) =>
            convs.map((c) =>
              c.roomId === roomId
                ? {
                    ...c,
                    memberIds: [...c.memberIds, ...memberIds],
                    memberCount: c.memberIds.length + memberIds.length,
                  }
                : c
            )
          );
          this._notifyService.showSuccess("Members added successfully");
        }),
        catchError((error) => {
          this._notifyService.showError(`Failed to add members: ${error.message}`);
          throw error;
        })
      );
  }

  removeGroupMembers(roomId: string, memberId: string): Observable<void> {
    const token = this._jwtTokenService.getToken();
    return this._apiService
      .invokeCommand<void>("remove_group_members", {
        id: roomId,
        member_ids: [memberId],
        token,
      })
      .pipe(
        tap(() => {
          this.conversations.update((convs) =>
            convs.map((c) =>
              c.roomId === roomId
                ? {
                    ...c,
                    memberIds: c.memberIds.filter((id) => id !== memberId),
                    memberCount: c.memberIds.length - 1,
                  }
                : c
            )
          );
          this._notifyService.showSuccess("Member removed");
        }),
        catchError((error) => {
          this._notifyService.showError(`Failed to remove member: ${error.message}`);
          throw error;
        })
      );
  }

  deleteGroup(roomId: string): Observable<void> {
    const token = this._jwtTokenService.getToken();
    return this._apiService.invokeCommand<void>("delete_group_cascade", { id: roomId, token }).pipe(
      tap(() => {
        this.conversations.update((convs) => convs.filter((c) => c.roomId !== roomId));
        if (this.activeConversationId() === roomId) {
          this.activeConversationId.set(null);
          this.messages.set([]);
        }
        this._notifyService.showSuccess("Group deleted");
      }),
      catchError((error) => {
        this._notifyService.showError(`Failed to delete group: ${error.message}`);
        throw error;
      })
    );
  }

  /* ════════════════════════════════════════════════════════════════════════
     CHAT HELPERS
     ════════════════════════════════════════════════════════════════════════ */

  updateChatByTempId(
    tempId: string,
    cloudId: string,
    syncStatus: "pending" | "synced" | "failed"
  ): void {
    this.chats.update((chats) =>
      chats.map((c) =>
        c.temp_id === tempId
          ? { ...c, id: cloudId, sync_status: syncStatus, temp_id: undefined }
          : c
      )
    );
  }

  updateChatSyncStatus(tempId: string, syncStatus: "pending" | "synced" | "failed"): void {
    this.chats.update((chats) =>
      chats.map((c) =>
        c.temp_id === tempId || c.id === tempId ? { ...c, sync_status: syncStatus } : c
      )
    );
  }

  updateConversationLastMessage(roomId: string, message: string): void {
    const timeNow = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    this.conversations.update((convs) =>
      convs.map((c) =>
        c.roomId === roomId ? { ...c, lastMessage: message, lastMessageTime: timeNow } : c
      )
    );
  }

  /* ════════════════════════════════════════════════════════════════════════
     CONVERSATION MANAGEMENT
     ════════════════════════════════════════════════════════════════════════ */

  selectConversation(roomId: string): void {
    this.activeConversationId.set(roomId);
    this.loadMessagesForRoom(roomId);

    const conv = this.conversations().find((c) => c.roomId === roomId);
    if (conv && conv.unreadCount > 0) {
      this.markConversationAsRead(roomId);
    }
  }

  loadMessagesForRoom(roomId: string, skip = 0, limit = 100): void {
    const token = this._jwtTokenService.getToken();
    this._apiService
      .invokeCommand<any>("get_messages_by_room", { roomId, skip, limit, token })
      .subscribe({
        next: (result: any) => {
          const data = Array.isArray(result) ? result : result?.data || [];
          const currentUserId = this.currentUserId();
          const msgs: ChatMessage[] = [];

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
              readStatus = otherReaders.length === 0 ? "sent" : "read";
            }

            msgs.push({
              id: chat.id,
              content: chat.content,
              senderId: chat.sender_id,
              senderName,
              senderAvatar,
              time: new Date(chat.created_at).toISOString(),
              isMine: chat.sender_id === currentUserId,
              isEdited: chat.is_edited === true,
              readStatus,
              replyId: chat.reply_id || null,
            });
          }

          this.messages.set(msgs);
          this.populateReplyChain(msgs);
        },
        error: () => {
          this.messages.set([]);
        },
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

  private markConversationAsRead(roomId: string): void {
    this.conversations.update((convs) =>
      convs.map((c) => (c.roomId === roomId ? { ...c, unreadCount: 0 } : c))
    );
  }

  loadConversationsFromChats(): void {
    const chats = this.chats();
    const currentUserId = this.currentUserId();
    const convMap = new Map<string, ConversationItem>();

    for (const chat of chats) {
      if (chat.deleted_at) continue;
      const roomId = chat.room_id;
      if (!roomId) continue;

      if (!convMap.has(roomId)) {
        const isGroup = roomId.startsWith("group_");
        let otherUserId: string | undefined;

        if (!isGroup) {
          otherUserId = chat.sender_id !== currentUserId ? chat.sender_id : undefined;
        }

        convMap.set(roomId, {
          roomId,
          name: isGroup ? "Group" : "Unknown",
          avatar: null,
          isOnline: false,
          isTyping: false,
          isGroup,
          unreadCount: 0,
          lastMessage: chat.content || "",
          lastMessageTime: chat.created_at
            ? new Date(chat.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "",
          memberIds: [],
          memberCount: 0,
          bio: "",
          otherUserId,
        });
      } else {
        const existing = convMap.get(roomId)!;
        existing.lastMessage = chat.content || existing.lastMessage;
        existing.lastMessageTime = chat.created_at
          ? new Date(chat.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : existing.lastMessageTime;
      }

      if (!chat.read_by?.includes(currentUserId) && chat.sender_id !== currentUserId) {
        const conv = convMap.get(roomId)!;
        conv.unreadCount++;
      }
    }

    const sorted = Array.from(convMap.values()).sort((a, b) => {
      const aTime = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
      const bTime = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
      return bTime - aTime;
    });

    this.conversations.set(sorted);
  }

  loadGroups(): void {
    const userId = this.currentUserId();
    if (!userId) return;
    if (!navigator.onLine || !this._mongoConnectionService.isConnected()) return;

    const token = this._jwtTokenService.getToken();
    this._apiService
      .invokeCommand<any>("get_groups", {
        userId,
        token,
        visibility: "all",
        page: 0,
        limit: 100,
      })
      .subscribe({
        next: (result: any) => {
          const groups = Array.isArray(result) ? result : result?.data || [];
          const existingRooms = new Set(this.conversations().map((c) => c.roomId));

          for (const group of groups) {
            if (!existingRooms.has(group.room_id)) {
              const conv: ConversationItem = {
                roomId: group.room_id,
                name: group.name,
                avatar: group.avatar || null,
                isOnline: false,
                isTyping: false,
                isGroup: true,
                unreadCount: 0,
                lastMessage: "",
                lastMessageTime: new Date(group.created_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
                memberIds: group.member_ids || [],
                memberCount: (group.member_ids || []).length,
                bio: "",
                otherUserId: undefined,
              };
              this.conversations.update((convs) => [...convs, conv]);
            }
          }
        },
        error: () => {},
      });
  }

  /* ════════════════════════════════════════════════════════════════════════
     OFFLINE QUEUE
     ════════════════════════════════════════════════════════════════════════ */

  private queueChatMessageForSync(
    tempId: string,
    roomId: string,
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
        room_id: roomId,
        sender_id: this.currentUserId(),
        content,
        reply_id: replyId,
        sync_status: "pending",
        temp_id: tempId,
      },
      timestamp: Date.now(),
      retries: 0,
      lastError,
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

  /* ════════════════════════════════════════════════════════════════════════
     STATE MANAGEMENT
     ════════════════════════════════════════════════════════════════════════ */

  setChats(chats: Chat[]): void {
    this.chats.set(chats);
    this.loadConversationsFromChats();
  }

  addChat(chat: Chat): void {
    this.chats.update((chats) => [...chats, chat]);
  }

  clearChatState(): void {
    this.conversations.set([]);
    this.messages.set([]);
    this.activeConversationId.set(null);
  }
}
