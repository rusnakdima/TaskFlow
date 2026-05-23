import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";
import { ChatState } from "../state/chat.state";
import { ApiService } from "@services/api.service";
import { AuthService } from "@services/auth/auth.service";
import { StorageService } from "@services/storage.service";
import { ProfileSearchService } from "@services/core/profile-search.service";
import { NotifyService } from "@services/notifications/notify.service";
import { MongoConnectionService } from "@services/core/mongo-connection.service";
import { Chat, Profile } from "@models/generated/api.types";
import { ConversationItem } from "@models/chat.model";
import { ChatMessage } from "@models/chat.model";
import { getProfileDisplayName } from "@utils/display-name.util";

@Injectable({ providedIn: "root" })
export class ChatService {
  private requestService = inject(ApiService);
  private authService = inject(AuthService);
  private storageService = inject(StorageService);
  private profileSearchService = inject(ProfileSearchService);
  private notifyService = inject(NotifyService);
  private mongoConnectionService = inject(MongoConnectionService);
  state = inject(ChatState);

  constructor() {
    this.initChatQueueListener();
  }

  private initChatQueueListener(): void {
    window.addEventListener("online", () => {
      this.processChatQueue();
    });

    if (navigator.onLine) {
      this.processChatQueue();
    }
  }

  loadAllUsers(): void {
    this.profileSearchService.loadInitial().subscribe({
      next: () => {
        console.log(
          "[ChatService] loadAllUsers completed, profiles:",
          this.profileSearchService.profiles().length
        );
        this.loadRooms();
        this.updateConversationsWithProfiles();
      },
      error: () => {
        this.loadRooms();
      },
    });
  }

  getLoadedProfiles(): Profile[] {
    return this.profileSearchService.profiles();
  }

  private updateConversationsWithProfiles(): void {
    const profiles = this.profileSearchService.profiles();
    if (profiles.length === 0) return;

    this.state.conversations.update((convs) =>
      convs.map((conv) => {
        if (conv.isGroup) return conv;

        const otherUserId =
          conv.otherUserId || (conv.roomId.startsWith("dm_") ? conv.roomId.substring(3) : null);
        if (!otherUserId) return conv;

        const profile = profiles.find((p) => p.user_id === otherUserId);
        if (profile) {
          return {
            ...conv,
            name: conv.name === "Unknown" ? getProfileDisplayName(profile) : conv.name,
            avatar: profile.image_url || conv.avatar,
            otherUserAvatar: profile.image_url || conv.otherUserAvatar,
          };
        }
        if (!conv.otherUserAvatar && conv.avatar) {
          return {
            ...conv,
            otherUserAvatar: conv.avatar,
          };
        }
        return conv;
      })
    );
  }

  loadRooms(): void {
    const userId = this.state.currentUserId();
    if (!userId) {
      this.loadConversations();
      this.loadGroups();
      return;
    }

    if (!navigator.onLine || !this.mongoConnectionService.isConnected()) {
      this.loadRoomsFromLocal();
      return;
    }

    this.requestService
      .invokeCommand("get_rooms", {
        token: this.authService.getToken(),
        load: "participants",
      })
      .subscribe({
        next: (result: any) => {
          const rooms = Array.isArray(result) ? result : result?.data || [];
          this.storageService.setRooms(rooms as any);
          this.loadConversations();
          this.loadGroups();
          this.loadRoomsIntoConversations(rooms);
        },
        error: (err) => {
          console.error("get_rooms error:", err);
          this.loadRoomsFromLocal();
        },
      });
  }

  private loadRoomsFromLocal(): void {
    this.requestService.chats.getAll({ visibility: "private", limit: 100 }).subscribe({
      next: () => {
        this.loadConversationsFromLocal();
        this.loadGroupsFromLocal();
      },
      error: () => {
        this.loadConversationsFromLocal();
        this.loadGroupsFromLocal();
      },
    });
  }

  private loadConversationsFromLocal(): void {
    const chats = this.storageService.chats();
    const currentUserId = this.state.currentUserId();
    const convMap = new Map<string, ConversationItem>();

    for (const chat of chats) {
      if (chat.deleted_at) continue;

      const roomId = chat.room_id;
      if (!roomId) continue;

      const existingConv = this.state.conversations().find((c) => c.roomId === roomId);

      if (!convMap.has(roomId)) {
        let name = "Unknown";
        let avatar: string | null = null;
        let isGroup = roomId.startsWith("group_");
        let memberIds: string[] = [];
        let otherUserId: string | undefined;

        if (existingConv && existingConv.name !== "Unknown") {
          name = existingConv.name;
          avatar = existingConv.avatar;
          otherUserId = existingConv.otherUserId;
        } else {
          if (!isGroup) {
            otherUserId = chat.sender_id !== currentUserId ? chat.sender_id : undefined;
            if (otherUserId) {
              const profile = this.getProfileByUserId(otherUserId);
              if (profile) {
                name = getProfileDisplayName(profile);
                avatar = profile.image_url || null;
              } else if (chat.author_name) {
                name = chat.author_name;
              } else {
                this.fetchProfileIfMissing(otherUserId);
              }
            }
          } else {
            name = "Group";
          }
        }

        convMap.set(roomId, {
          roomId: roomId,
          name: name,
          avatar: avatar,
          isOnline: false,
          isTyping: false,
          isGroup: isGroup,
          unreadCount: 0,
          lastMessage: chat.content || "",
          lastMessageTime: this.state.formatDate(chat.created_at || ""),
          memberIds: memberIds,
          memberCount: memberIds.length,
          bio: "",
          otherUserId: otherUserId,
          isLocal: true,
        });
      } else {
        const existing = convMap.get(roomId)!;
        existing.lastMessage = chat.content || existing.lastMessage;
        existing.lastMessageTime = this.state.formatDate(chat.created_at || "");
      }
    }

    const existingConversations = this.state.conversations();
    for (const conv of existingConversations) {
      if (!convMap.has(conv.roomId)) {
        convMap.set(conv.roomId, { ...conv, isLocal: true });
      }
    }

    const sorted = Array.from(convMap.values()).sort((a, b) => {
      const timeA = a.lastMessageTime || "";
      const timeB = b.lastMessageTime || "";
      return timeB.localeCompare(timeA);
    });

    this.state.conversations.set(sorted);
  }

  private loadGroupsFromLocal(): void {
    // Groups from local storage - chats with room_id starting with "group_"
    const chats = this.storageService.chats();
    const existingRooms = new Set(this.state.conversations().map((c) => c.roomId));

    for (const chat of chats) {
      if (chat.deleted_at) continue;
      const roomId = chat.room_id;
      if (!roomId || !roomId.startsWith("group_")) continue;

      if (!existingRooms.has(roomId)) {
        const conv: ConversationItem = {
          roomId: roomId,
          name: "Group",
          avatar: null,
          isOnline: false,
          isTyping: false,
          isGroup: true,
          unreadCount: 0,
          lastMessage: "",
          lastMessageTime: this.state.formatDate(chat.created_at || ""),
          memberIds: [],
          memberCount: 0,
          bio: "",
          otherUserId: undefined,
          isLocal: true,
        };
        this.state.conversations.update((convs) => [...convs, conv]);
      }
    }
  }

  private loadRoomsIntoConversations(rooms: any[]): void {
    const currentUserId = this.state.currentUserId();
    if (!currentUserId || !Array.isArray(rooms)) return;

    for (const room of rooms) {
      const isGroup = room.is_group === true || (room.room || "").startsWith("group_");
      const memberIds: string[] = (room.participant_ids || []).filter(
        (id: string) => id && id.trim() !== ""
      );
      const otherUserId = isGroup
        ? undefined
        : memberIds.find((id: string) => id !== currentUserId);

      let name = isGroup ? room.name || "Group" : room.name || "Unknown";
      let avatar: string | null = null;

      if (!isGroup && otherUserId) {
        const profile = this.getProfileByUserId(otherUserId);
        if (profile) {
          name = getProfileDisplayName(profile);
          avatar = profile.image_url || null;
        } else {
          this.fetchProfileIfMissing(otherUserId);
        }
      }

      const existingIdx = this.state.conversations().findIndex((c) => c.roomId === room.room);

      if (existingIdx !== -1) {
        const currentConv = this.state.conversations()[existingIdx];
        if (currentConv.isLocal || currentConv.name === "Unknown") {
          this.state.conversations.update((convs) => {
            const updated = [...convs];
            updated[existingIdx] = {
              ...updated[existingIdx],
              name: name || updated[existingIdx].name,
              avatar: avatar || updated[existingIdx].avatar,
              otherUserAvatar: avatar || updated[existingIdx].otherUserAvatar,
              otherUserId: otherUserId,
              isLocal: false,
            };
            return updated;
          });
        }
        continue;
      }

      const conv: ConversationItem = {
        roomId: room.room,
        name: name,
        avatar: avatar,
        otherUserAvatar: avatar,
        isOnline: false,
        isTyping: false,
        isGroup: isGroup,
        unreadCount: 0,
        lastMessage: "",
        lastMessageTime: "",
        memberIds: memberIds,
        memberCount: memberIds.length,
        bio: "",
        otherUserId: otherUserId,
      };

      this.state.conversations.update((convs) => [...convs, conv]);
    }
  }

  private loadConversations(): void {
    const chats = this.storageService.chats();
    const currentUserId = this.state.currentUserId();
    const convMap = new Map<string, ConversationItem>();

    for (const chat of chats) {
      if (chat.deleted_at) continue;

      const roomId = chat.room_id;
      if (!roomId) continue;

      const existingConv = this.state.conversations().find((c) => c.roomId === roomId);

      if (!convMap.has(roomId)) {
        let name = "Unknown";
        let avatar: string | null = null;
        let isGroup = roomId.startsWith("group_");
        let memberIds: string[] = [];
        let otherUserId: string | undefined;

        if (existingConv && existingConv.name !== "Unknown") {
          name = existingConv.name;
          avatar = existingConv.avatar;
          otherUserId = existingConv.otherUserId;
        } else {
          if (!isGroup) {
            otherUserId = chat.sender_id !== currentUserId ? chat.sender_id : undefined;
            if (otherUserId) {
              const profile = this.getProfileByUserId(otherUserId);
              if (profile) {
                name = getProfileDisplayName(profile);
                avatar = profile.image_url || null;
              } else if (chat.author_name) {
                name = chat.author_name;
              } else {
                this.fetchProfileIfMissing(otherUserId);
              }
            }
          } else {
            name = "Group";
          }
        }

        convMap.set(roomId, {
          roomId: roomId,
          name: name,
          avatar: avatar,
          otherUserAvatar: avatar,
          isOnline: false,
          isTyping: false,
          isGroup: isGroup,
          unreadCount: 0,
          lastMessage: chat.content || "",
          lastMessageTime: this.state.formatDate(chat.created_at || ""),
          memberIds: memberIds,
          memberCount: memberIds.length,
          bio: "",
          otherUserId: otherUserId,
        });
      }

      const conv = convMap.get(roomId)!;
      conv.lastMessage = chat.content;
      conv.lastMessageTime = this.state.formatDate(chat.created_at || "");

      if (!chat.read_by?.includes(currentUserId) && chat.sender_id !== currentUserId) {
        conv.unreadCount++;
      }
    }

    const sorted = Array.from(convMap.values()).sort((a, b) => {
      const aTime = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
      const bTime = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
      return bTime - aTime;
    });

    this.state.conversations.set(sorted);
  }

  private loadGroups(): void {
    const userId = this.state.currentUserId();
    if (!userId) return;

    if (!navigator.onLine || !this.mongoConnectionService.isConnected()) {
      this.loadGroupsFromLocal();
      return;
    }

    this.requestService
      .invokeCommand("get_groups", {
        userId: userId,
        token: this.authService.getToken(),
        visibility: "all",
        page: 0,
        limit: 100,
      })
      .subscribe({
        next: (result: any) => {
          const groups = Array.isArray(result) ? result : result?.data || [];
          if (Array.isArray(groups)) {
            const existingRooms = new Set(this.state.conversations().map((c) => c.roomId));

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
                  lastMessageTime: this.state.formatDate(group.created_at || ""),
                  memberIds: group.member_ids || [],
                  memberCount: (group.member_ids || []).length,
                  bio: "",
                  otherUserId: undefined,
                };
                this.state.conversations.update((convs) => [...convs, conv]);
              }
            }
          }
        },
        error: (err) => {
          console.error("Load groups error:", err);
          this.loadGroupsFromLocal();
        },
      });
  }

  selectConversation(conv: ConversationItem): void {
    this.state.activeConversationId.set(conv.roomId);
    this.loadMessagesForRoom(conv.roomId);
    this.state.showSidebar.set(false);
    if (conv.unreadCount > 0) {
      this.markConversationAsRead(conv.roomId);
    }
    if (!conv.isGroup && conv.otherUserId) {
      this.fetchProfileIfMissing(conv.otherUserId);
    }
    setTimeout(() => this.updateConversationsWithProfiles(), 100);
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

  private markConversationAsRead(roomId: string): void {
    const conv = this.state.conversations().find((c) => c.roomId === roomId);
    if (conv) {
      conv.unreadCount = 0;
      this.state.conversations.update((convs) =>
        convs.map((c) => (c.roomId === roomId ? { ...c, unreadCount: 0 } : c))
      );
    }
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
    conv: ConversationItem,
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
    } catch {}
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
      console.warn("[ChatService] retrySendMessage: op not found in queue", tempId);
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
          this.loadConversations();
        },
        error: () => {
          this.loadConversations();
        },
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

  createGroup(name: string): void {
    const userId = this.state.currentUserId();
    if (!userId || !name.trim()) return;

    const roomId = "group_" + Date.now();

    this.requestService
      .invokeCommand("create_group", {
        name: name,
        roomId: roomId,
        ownerId: userId,
        memberIds: [userId],
        token: this.authService.getToken(),
      })
      .subscribe({
        next: () => {
          this.state.newGroupName.set("");
          this.state.showCreateGroupModal.set(false);
          this.loadGroups();
          this.notifyService.showSuccess("Group created successfully");
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to create group");
        },
      });
  }

  addMembersToGroup(): void {
    const conv = this.state.activeConversation();
    if (!conv || !conv.isGroup || this.state.selectedAddMembers().length === 0) return;

    const memberIds = this.state.selectedAddMembers();

    this.requestService
      .invokeCommand("add_group_members", {
        id: conv.roomId,
        memberIds: memberIds,
        token: this.authService.getToken(),
      })
      .subscribe({
        next: () => {
          this.notifyService.showSuccess("Members added successfully");
          const newMemberIds = [...conv.memberIds, ...this.state.selectedAddMembers()];
          this.state.conversations.update((convs) =>
            convs.map((c) =>
              c.roomId === conv.roomId
                ? { ...c, memberIds: newMemberIds, memberCount: newMemberIds.length }
                : c
            )
          );
          this.state.closeAddMembersDropdown();
          this.loadMembers();
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to add members");
        },
      });
  }

  removeMemberFromGroup(memberId: string): void {
    const conv = this.state.activeConversation();
    if (!conv || !conv.isGroup) return;

    this.requestService
      .invokeCommand("remove_group_members", {
        id: conv.roomId,
        member_ids: [memberId],
        token: this.authService.getToken(),
      })
      .subscribe({
        next: () => {
          this.notifyService.showSuccess("Member removed");
          const newMemberIds = conv.memberIds.filter((id) => id !== memberId);
          this.state.conversations.update((convs) =>
            convs.map((c) =>
              c.roomId === conv.roomId
                ? { ...c, memberIds: newMemberIds, memberCount: newMemberIds.length }
                : c
            )
          );
          this.loadMembers();
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to remove member");
        },
      });
  }

  loadMembers(): void {
    const conv = this.state.activeConversation();
    if (!conv) return;

    const memberIds = conv.memberIds || [];
    const profiles = this.profileSearchService.profiles();
    const membersList: any[] = [];

    for (const memberId of memberIds) {
      const profile = profiles.find((p) => p.user_id === memberId);
      if (profile) {
        membersList.push({
          id: profile.user_id,
          name: getProfileDisplayName(profile),
          avatar: profile.image_url || undefined,
        });
      } else {
        membersList.push({
          id: memberId,
          name: "Unknown User",
          avatar: undefined,
        });
      }
    }

    this.state.members.set(membersList);
    this.loadGroupOwner();
  }

  loadGroupOwner(): void {
    const conv = this.state.activeConversation();
    if (!conv || !conv.isGroup) {
      this.state.groupOwnerId.set(null);
      return;
    }

    this.requestService
      .invokeCommand("get_group_by_room", {
        room_id: conv.roomId,
        token: this.authService.getToken(),
      })
      .subscribe({
        next: (result: any) => {
          if (result?.data?.owner_id) {
            this.state.groupOwnerId.set(result.data.owner_id);
          }
        },
        error: () => {
          this.state.groupOwnerId.set(null);
        },
      });
  }

  removeConversation(): void {
    const conv = this.state.contextMenuConversation();
    if (!conv) return;

    if (conv.isGroup) {
      this.requestService
        .invokeCommand("delete_group_cascade", {
          id: conv.roomId,
          token: this.authService.getToken(),
        })
        .subscribe({
          next: () => {
            this.state.conversations.update((convs) =>
              convs.filter((c) => c.roomId !== conv.roomId)
            );
            if (this.state.activeConversationId() === conv.roomId) {
              this.state.activeConversationId.set(null);
              this.state.messages.set([]);
            }
            this.notifyService.showSuccess("Conversation removed");
            this.state.closeContextMenu();
          },
          error: (err) => {
            this.notifyService.showError(err.message || "Failed to remove conversation");
            this.state.closeContextMenu();
          },
        });
    } else {
      this.requestService
        .invokeCommand("hard_delete_room_messages", {
          roomId: conv.roomId,
          token: this.authService.getToken(),
        })
        .subscribe({
          next: () => {
            this.state.conversations.update((convs) =>
              convs.filter((c) => c.roomId !== conv.roomId)
            );
            if (this.state.activeConversationId() === conv.roomId) {
              this.state.activeConversationId.set(null);
              this.state.messages.set([]);
            }
            this.notifyService.showSuccess("Conversation removed");
            this.state.closeContextMenu();
          },
          error: (err) => {
            this.notifyService.showError(err.message || "Failed to remove conversation");
            this.state.closeContextMenu();
          },
        });
    }
  }

  togglePinConversation(): void {
    const conv = this.state.contextMenuConversation();
    if (!conv) return;
    this.state.conversations.update((convs) =>
      convs.map((c) => (c.roomId === conv.roomId ? { ...c, isPinned: !c.isPinned } : c))
    );
    this.state.closeContextMenu();
  }

  toggleMuteConversation(): void {
    const conv = this.state.contextMenuConversation();
    if (!conv) return;
    this.state.conversations.update((convs) =>
      convs.map((c) => (c.roomId === conv.roomId ? { ...c, isMuted: !c.isMuted } : c))
    );
    this.state.closeContextMenu();
  }

  markAsReadConversation(): void {
    const conv = this.state.contextMenuConversation();
    if (!conv || conv.unreadCount === 0) {
      this.state.closeContextMenu();
      return;
    }
    this.markConversationAsRead(conv.roomId);
    this.state.conversations.update((convs) =>
      convs.map((c) => (c.roomId === conv.roomId ? { ...c, unreadCount: 0 } : c))
    );
    this.state.closeContextMenu();
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

  openConversationWithUserId(userId: string): void {
    this.profileSearchService.loadInitial().subscribe({
      next: () => {
        const profile = this.getProfileByUserId(userId);
        if (profile) {
          this.startConversationWithUser(profile);
        } else {
          this.fetchProfileAndOpenChat(userId);
        }
      },
      error: () => {
        this.fetchProfileAndOpenChat(userId);
      },
    });
  }

  private fetchProfileAndOpenChat(userId: string): void {
    this.requestService
      .invokeCommand("get_profile", {
        filter: { user_id: userId },
        token: this.authService.getToken(),
        visibility: "public",
      })
      .subscribe({
        next: (profile: any) => {
          if (profile) {
            this.startConversationWithUser(profile);
          } else {
            this.notifyService.showError("Failed to load user profile");
          }
        },
        error: (err) => {
          this.notifyService.showError("Failed to load user profile: " + (err.message || err));
        },
      });
  }

  startConversationWithUser(profile: Profile): void {
    const userId = this.state.currentUserId();
    if (!userId) return;

    const profileUserId = profile.user_id;

    if (!this.state.recentUserIds().includes(profileUserId)) {
      this.state.recentUserIds.update((ids) => [profileUserId, ...ids].slice(0, 20));
    }

    const existing = this.state
      .conversations()
      .find((c) => !c.isGroup && c.otherUserId === profileUserId);
    if (existing) {
      this.selectConversation(existing);
      this.state.closeUserDropdown();
      return;
    }

    const roomId = crypto.randomUUID();
    const conv: ConversationItem = {
      roomId: roomId,
      name: getProfileDisplayName(profile),
      avatar: profile.image_url || null,
      isOnline: false,
      isTyping: false,
      isGroup: false,
      unreadCount: 0,
      lastMessage: "",
      lastMessageTime: "",
      memberIds: [],
      memberCount: 0,
      bio: profile.bio || "",
      otherUserId: profileUserId,
      isLocal: true,
    };

    this.state.conversations.update((convs) => [conv, ...convs]);

    this.state.activeConversationId.set(roomId);
    this.state.messages.set([]);
    this.state.showSidebar.set(false);
    this.state.closeUserDropdown();
  }

  private getProfileByUserId(userId: string): Profile | undefined {
    const profiles = this.profileSearchService.profiles();
    return profiles.find((p) => p.user_id === userId);
  }

  private fetchProfileIfMissing(userId: string): void {
    if (!this.getProfileByUserId(userId)) {
      this.requestService
        .invokeCommand("get_profile", {
          filter: { user_id: userId },
          token: this.authService.getToken(),
          visibility: "public",
        })
        .subscribe({
          next: (profile: any) => {
            if (profile?.user_id) {
              this.profileSearchService.addProfile(profile);
              setTimeout(() => this.updateConversationsWithProfiles(), 50);
            }
          },
          error: () => {},
        });
    }
  }

  isCurrentUserOwner(): boolean {
    const ownerId = this.state.groupOwnerId();
    const currentUserId = this.state.currentUserId();
    return ownerId !== null && ownerId === currentUserId;
  }
}
