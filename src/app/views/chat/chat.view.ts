/* sys lib */
import { Component, OnInit, signal, computed, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* services */
import { ApiService } from "@services/api.service";
import { StorageService } from "@services/storage.service";
import { AuthService } from "@services/auth/auth.service";
import { ThemeService } from "@services/ui/theme.service";
import { NotifyService } from "@services/notifications/notify.service";
import { ProfileSearchService } from "@services/core/profile-search.service";
import { Profile, Chat } from "@models/generated/api.types";

export interface ConversationItem {
  roomId: string;
  name: string;
  avatar: string | null;
  isOnline: boolean;
  isTyping: boolean;
  isGroup: boolean;
  unreadCount: number;
  lastMessage: string;
  lastMessageTime: string;
  memberIds: string[];
  memberCount: number;
  bio: string;
  otherUserId?: string;
}

export interface ChatMessage {
  id: string;
  content: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  time: string;
  isMine: boolean;
}

@Component({
  selector: "app-chat",
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: "./chat.view.html",
})
export class ChatView implements OnInit {
  private requestService = inject(ApiService);
  private storageService = inject(StorageService);
  private authService = inject(AuthService);
  private themeService = inject(ThemeService);
  private notifyService = inject(NotifyService);
  private profileSearchService = inject(ProfileSearchService);

  showSidebar = signal(true);
  showDetailsPanel = signal(false);
  showCreateGroupModal = signal(false);
  showUserDropdown = signal(false);
  showSearchDropdown = signal(false);
  userDropdownSearch = signal("");
  recentUserIds = signal<string[]>([]);
  contextMenuConversation = signal<ConversationItem | null>(null);
  showContextMenu = signal(false);
  contextMenuPosition = signal({ x: 0, y: 0 });
  isMobile = signal(typeof window !== "undefined" && window.innerWidth < 768);

  filterType = signal<"all" | "unread" | "groups">("all");
  searchQuery = signal("");

  conversations = signal<ConversationItem[]>([]);
  activeConversationId = signal<string | null>(null);
  messages = signal<ChatMessage[]>([]);

  messageInput = signal("");
  newGroupName = signal("");

  currentUserId = computed(() => this.authService.getValueByKey("id"));

  activeConversation = computed(() => {
    const id = this.activeConversationId();
    if (!id) return null;
    return this.conversations().find((c) => c.roomId === id) || null;
  });

  activeMessages = computed(() => this.messages());

  filteredConversations = computed(() => {
    let result = this.conversations();
    const type = this.filterType();
    const query = this.searchQuery().toLowerCase().trim();

    if (type === "unread") {
      result = result.filter((c) => c.unreadCount > 0);
    } else if (type === "groups") {
      result = result.filter((c) => c.isGroup);
    }

    if (query) {
      result = result.filter(
        (c) => c.name.toLowerCase().includes(query) || c.lastMessage.toLowerCase().includes(query)
      );
    }

    return result;
  });

  isDarkMode = computed(() => this.themeService.getEffectiveMode() === "dark");

  searchDropdownUsers = computed(() => {
    const search = this.userDropdownSearch().toLowerCase();
    const currentUserId = this.currentUserId();
    const recentIds = this.recentUserIds();

    const allProfiles = this.profileSearchService.profiles();
    const filterFn = (u: Profile) => {
      if (u.user_id === currentUserId) return false;
      if (!search) return true;
      const nameMatch = `${u.name} ${u.last_name}`.toLowerCase().includes(search);
      return nameMatch;
    };

    const recent = allProfiles.filter((u) => recentIds.includes(u.user_id) && filterFn(u));
    const others = allProfiles.filter((u) => !recentIds.includes(u.user_id) && filterFn(u));

    return { recent, others };
  });

  isProfilesLoading = computed(() => this.profileSearchService.isLoading());
  isSearching = computed(() => this.profileSearchService.isSearching());
  hasMoreProfiles = computed(() => this.profileSearchService.hasMore());

  onConversationContextMenu(event: MouseEvent, conv: ConversationItem): void {
    event.preventDefault();
    event.stopPropagation();
    this.contextMenuConversation.set(conv);
    this.contextMenuPosition.set({ x: event.clientX, y: event.clientY });
    this.showContextMenu.set(true);
  }

  closeContextMenu(): void {
    this.showContextMenu.set(false);
    this.contextMenuConversation.set(null);
  }

  removeConversation(): void {
    const conv = this.contextMenuConversation();
    if (!conv) return;

    console.log(
      "[DEBUG removeConversation] deleting roomId:",
      conv.roomId,
      "isGroup:",
      conv.isGroup
    );

    if (conv.isGroup) {
      // For groups, we need to call delete_group with the group's id (not room_id)
      // But we don't have the group id in ConversationItem - we need to check the structure
      this.requestService
        .invokeCommand("delete_group", {
          id: conv.roomId, // TODO: should be group id, not room id
          token: this.authService.getToken(),
        })
        .subscribe({
          next: () => {
            console.log("[DEBUG removeConversation] delete_group success");
            this.conversations.update((convs) => convs.filter((c) => c.roomId !== conv.roomId));
            if (this.activeConversationId() === conv.roomId) {
              this.activeConversationId.set(null);
              this.messages.set([]);
            }
            this.notifyService.showSuccess("Conversation removed");
            this.closeContextMenu();
          },
          error: (err) => {
            console.error("[DEBUG removeConversation] delete_group error:", err);
            this.notifyService.showError(err.message || "Failed to remove conversation");
            this.closeContextMenu();
          },
        });
    } else {
      this.requestService
        .invokeCommand("delete_room", {
          roomId: conv.roomId,
          token: this.authService.getToken(),
        })
        .subscribe({
          next: () => {
            console.log("[DEBUG removeConversation] delete_room success");
            this.conversations.update((convs) => convs.filter((c) => c.roomId !== conv.roomId));
            if (this.activeConversationId() === conv.roomId) {
              this.activeConversationId.set(null);
              this.messages.set([]);
            }
            this.notifyService.showSuccess("Conversation removed");
            this.closeContextMenu();
          },
          error: (err) => {
            console.error("[DEBUG removeConversation] delete_room error:", err);
            this.notifyService.showError(err.message || "Failed to remove conversation");
            this.closeContextMenu();
          },
        });
    }
  }

  ngOnInit(): void {
    this.loadAllUsers();
    if (typeof window !== "undefined") {
      window.addEventListener("resize", () => {
        this.isMobile.set(window.innerWidth < 768);
      });
    }
  }

  private loadAllUsers(): void {
    this.profileSearchService.loadInitial().subscribe({
      next: () => {
        this.loadRooms();
      },
      error: () => {
        this.loadRooms();
      },
    });
  }

  private loadRooms(): void {
    const userId = this.currentUserId();
    if (!userId) {
      this.loadConversations();
      this.loadGroups();
      return;
    }

    this.requestService
      .invokeCommand("get_rooms", {
        userId: userId,
        token: this.authService.getToken(),
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
          this.loadConversations();
          this.loadGroups();
        },
      });
  }

  onSearchChange(value: string): void {
    this.userDropdownSearch.set(value);
    this.searchQuery.set(value);
    this.profileSearchService.search(value);
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      this.profileSearchService.loadInitial().subscribe();
      this.showSearchDropdown.set(true);
    }
  }

  onSearchFocus(): void {
    this.profileSearchService.loadInitial().subscribe();
    this.showSearchDropdown.set(true);
  }

  onSearchBlur(): void {
    setTimeout(() => {
      this.showSearchDropdown.set(false);
    }, 200);
  }

  hideSearchDropdown(): void {
    this.showSearchDropdown.set(false);
  }

  onSearchDropdownScroll(event: Event): void {
    const target = event.target as HTMLElement;
    const isNearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 100;
    if (isNearBottom && this.hasMoreProfiles() && !this.isProfilesLoading()) {
      this.loadMoreProfiles();
    }
  }

  loadMoreProfiles(): void {
    this.profileSearchService.loadMore().subscribe();
  }

  toggleUserDropdown(): void {
    if (this.showUserDropdown()) {
      this.showUserDropdown.set(false);
    } else {
      this.loadAllUsers();
      this.showUserDropdown.set(true);
    }
  }

  closeUserDropdown(): void {
    this.showUserDropdown.set(false);
    this.userDropdownSearch.set("");
  }

  startConversationWithUser(profile: Profile): void {
    const userId = this.currentUserId();
    if (!userId) return;

    const profileUserId = profile.user_id;
    if (!this.recentUserIds().includes(profileUserId)) {
      this.recentUserIds.update((ids) => [profileUserId, ...ids].slice(0, 20));
    }

    const roomId = `dm_${profileUserId}`;
    const conv: ConversationItem = {
      roomId: roomId,
      name: this.getProfileDisplayName(profile),
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
    };

    const existing = this.conversations().find((c) => c.roomId === roomId);
    if (!existing) {
      this.conversations.update((convs) => [conv, ...convs]);
    }

    this.selectConversation(conv);
    this.closeUserDropdown();
  }

  private getProfileDisplayName(profile: Profile): string {
    const name = profile.name?.trim() || "";
    const lastName = profile.last_name?.trim() || "";
    if (name && lastName) return `${name} ${lastName}`;
    if (name) return name;
    if (lastName) return lastName;
    return profile.user?.username || "Unknown";
  }

  private getProfileByUserId(userId: string): Profile | undefined {
    const profiles = this.profileSearchService.profiles();
    return profiles.find((p) => p.user_id === userId);
  }

  filterChats(type: "all" | "unread" | "groups"): void {
    this.filterType.set(type);
  }

  selectConversation(conv: ConversationItem): void {
    this.activeConversationId.set(conv.roomId);
    this.loadMessagesForRoom(conv.roomId);
    this.showSidebar.set(false);
    if (conv.unreadCount > 0) {
      this.markConversationAsRead(conv.roomId);
    }
  }

  closeConversation(): void {
    this.activeConversationId.set(null);
    this.messages.set([]);
    this.showSidebar.set(true);
  }

  toggleDetailsPanel(): void {
    this.showDetailsPanel.update((v) => !v);
  }

  onMessageInputChange(value: string): void {
    this.messageInput.set(value);
  }

  onInputKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      this.sendMessageInternal();
    }
  }

  sendMessage(event?: Event): void {
    if (event) event.preventDefault();
    this.sendMessageInternal();
  }

  private sendMessageInternal(): void {
    const content = this.messageInput().trim();
    const conv = this.activeConversation();
    if (!content || !conv) return;

    const userId = this.currentUserId();
    if (!userId) return;

    this.requestService
      .invokeCommand("send_message", {
        roomId: conv.roomId,
        senderId: userId,
        userId: conv.isGroup ? conv.roomId : conv.otherUserId,
        content: content,
        token: this.authService.getToken(),
      })
      .subscribe({
        next: () => {
          this.messageInput.set("");
          this.loadMessagesForRoom(conv.roomId);
          this.reloadChatsFromApi();
          this.updateConversationLastMessage(conv.roomId, content);
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to send message");
        },
      });
  }

  createGroup(): void {
    const name = this.newGroupName().trim();
    if (!name) return;

    const userId = this.currentUserId();
    if (!userId) return;

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
          this.newGroupName.set("");
          this.showCreateGroupModal.set(false);
          this.loadGroups();
          this.notifyService.showSuccess("Group created successfully");
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to create group");
        },
      });
  }

  private loadRoomsIntoConversations(rooms: any[]): void {
    const currentUserId = this.currentUserId();
    if (!currentUserId || !Array.isArray(rooms)) return;

    const existingRoomIds = new Set(this.conversations().map((c) => c.roomId));

    for (const room of rooms) {
      if (existingRoomIds.has(room.room)) continue;

      const isGroup = room.is_group === true || (room.room || "").startsWith("group_");
      const memberIds: string[] = room.participant_ids || [];
      const otherUserId = isGroup
        ? undefined
        : memberIds.find((id: string) => id !== currentUserId);

      let name = isGroup ? room.name || "Group" : "Unknown";
      let avatar: string | null = null;

      if (!isGroup && otherUserId) {
        const profile = this.getProfileByUserId(otherUserId);
        if (profile) {
          name = this.getProfileDisplayName(profile);
          avatar = profile.image_url || null;
        }
      }

      const conv: ConversationItem = {
        roomId: room.room,
        name: name,
        avatar: avatar,
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

      this.conversations.update((convs) => [...convs, conv]);
    }
  }

  private loadConversations(): void {
    const chats = this.storageService.chats();
    const currentUserId = this.currentUserId();
    const convMap = new Map<string, ConversationItem>();

    for (const chat of chats) {
      if (chat.deleted_at) continue;

      const roomId = chat.room_id || chat.user_id;

      if (!convMap.has(roomId)) {
        let name = "Unknown";
        let avatar: string | null = null;
        let isGroup = roomId.startsWith("group_");
        let memberIds: string[] = [];
        let otherUserId: string | undefined;

        if (!isGroup && roomId.startsWith("dm_")) {
          otherUserId = roomId.substring(3);
          const profile = this.getProfileByUserId(otherUserId);
          if (profile) {
            name = this.getProfileDisplayName(profile);
            avatar = profile.image_url || null;
          } else if (chat.author_name) {
            name = chat.author_name;
          }
        } else if (isGroup) {
          name = "Group";
        } else {
          name = chat.author_name || roomId;
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
          lastMessageTime: this.formatTime(chat.created_at || ""),
          memberIds: memberIds,
          memberCount: memberIds.length,
          bio: "",
          otherUserId: otherUserId,
        });
      }

      const conv = convMap.get(roomId)!;
      conv.lastMessage = chat.content;
      conv.lastMessageTime = this.formatTime(chat.created_at || "");

      if (!chat.read_by?.includes(currentUserId) && chat.sender_id !== currentUserId) {
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

  private reloadChatsFromApi(): void {
    this.requestService
      .getAll<Chat>("chats", {
        visibility: "all",
        limit: 100,
      })
      .subscribe({
        next: (chats) => {
          this.storageService.setChats(chats);
          this.loadConversations();
        },
        error: () => {
          this.loadConversations();
        },
      });
  }

  private loadGroups(): void {
    const userId = this.currentUserId();
    if (!userId) return;

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
                  lastMessageTime: this.formatTime(group.created_at || ""),
                  memberIds: group.member_ids || [],
                  memberCount: (group.member_ids || []).length,
                  bio: "",
                  otherUserId: undefined,
                };
                this.conversations.update((convs) => [...convs, conv]);
              }
            }
          }
        },
        error: (err) => {
          console.error("Load groups error:", err);
        },
      });
  }

  private loadMessagesForRoom(roomId: string): void {
    this.requestService
      .invokeCommand("get_messages_by_room", {
        roomId: roomId,
        skip: 0,
        limit: 100,
        token: this.authService.getToken(),
      })
      .subscribe({
        next: (result: any) => {
          const currentUserId = this.currentUserId();
          const msgs: ChatMessage[] = [];

          const data = Array.isArray(result) ? result : result.data || [];

          for (const chat of data) {
            if (chat.deleted_at) continue;

            const profile = this.getProfileByUserId(chat.sender_id);

            msgs.push({
              id: chat.id,
              content: chat.content,
              senderId: chat.sender_id,
              senderName: chat.author_name || chat.sender_id,
              senderAvatar: profile?.image_url,
              time: this.formatTime(chat.created_at || ""),
              isMine: chat.sender_id === currentUserId,
            });
          }

          this.messages.set(msgs);
        },
        error: () => {
          this.messages.set([]);
        },
      });
  }

  private markConversationAsRead(roomId: string): void {
    const conv = this.conversations().find((c) => c.roomId === roomId);
    if (conv) {
      conv.unreadCount = 0;
      this.conversations.update((convs) =>
        convs.map((c) => (c.roomId === roomId ? { ...c, unreadCount: 0 } : c))
      );
    }
  }

  private updateConversationLastMessage(roomId: string, message: string): void {
    const timeNow = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    this.conversations.update((convs) =>
      convs.map((c) =>
        c.roomId === roomId ? { ...c, lastMessage: message, lastMessageTime: timeNow } : c
      )
    );
  }

  private formatTime(dateStr: string): string {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const dayMs = 24 * 60 * 60 * 1000;

    if (diff < dayMs) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else if (diff < 7 * dayMs) {
      return date.toLocaleDateString([], { weekday: "short" });
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  }
}
