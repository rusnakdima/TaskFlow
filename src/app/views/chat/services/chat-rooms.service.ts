import { Injectable, inject } from "@angular/core";
import { ChatState } from "../state/chat.state";
import { ApiService } from "@services/api.service";
import { AuthService } from "@services/auth/auth.service";
import { UnifiedStorageService } from "@core/services/unified-storage.service";
import { MongoConnectionService } from "@core/services/mongo-connection.service";
import { ConversationItem } from "@models/chat.model";
import { getProfileDisplayName } from "@utils/display-name.util";
import { logger } from "@services/logger.service";

@Injectable({ providedIn: "root" })
export class ChatRoomsService {
  private requestService = inject(ApiService);
  private authService = inject(AuthService);
  private storageService = inject(UnifiedStorageService);
  private mongoConnectionService = inject(MongoConnectionService);
  state = inject(ChatState);

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
          logger.error("get_rooms error", err);
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
          logger.error("Load groups error", err);
          this.loadGroupsFromLocal();
        },
      });
  }

  selectConversation(conv: ConversationItem): void {
    this.state.activeConversationId.set(conv.roomId);
    this.state.showSidebar.set(false);
    if (conv.unreadCount > 0) {
      this.markConversationAsRead(conv.roomId);
    }
    if (!conv.isGroup && conv.otherUserId) {
      this.fetchProfileIfMissing(conv.otherUserId);
    }
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

  private getProfileByUserId(userId: string): any {
    return undefined;
  }

  private fetchProfileIfMissing(userId: string): void {}
}
