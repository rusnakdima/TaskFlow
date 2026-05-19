/* sys lib */
import {
  Component,
  OnInit,
  signal,
  computed,
  inject,
  DestroyRef,
  ViewChild,
  ElementRef,
  AfterViewChecked,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* components */
import { UserAvatarComponent } from "@components/user-avatar/user-avatar.component";
import { OnlineStatusComponent } from "@components/online-status/online-status.component";

/* services */
import { ApiService } from "@services/api.service";
import { StorageService } from "@services/storage.service";
import { AuthService } from "@services/auth/auth.service";
import { ThemeService } from "@services/ui/theme.service";
import { NotifyService } from "@services/notifications/notify.service";
import { ProfileSearchService } from "@services/core/profile-search.service";
import { Profile, Chat } from "@models/generated/api.types";

/* models */
import { ConversationItem, ChatMessage, FilterType, EmojiTab } from "@models/chat.model";

/* constants */
import {
  SMILEYS_EMOJIS,
  GESTURES_EMOJIS,
  OBJECTS_EMOJIS,
  RECENT_EMOJIS_DEFAULT,
} from "@constants/emoji.constants";

/* utils */
import { formatTime } from "@utils/format-time.util";
import { getProfileDisplayName } from "@utils/display-name.util";

@Component({
  selector: "app-chat",
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, UserAvatarComponent, OnlineStatusComponent],
  templateUrl: "./chat.view.html",
})
export class ChatView implements OnInit, AfterViewChecked {
  @ViewChild("scrollSentinel") scrollSentinel?: ElementRef<HTMLDivElement>;
  private shouldScrollToBottom = false;
  private requestService = inject(ApiService);
  private storageService = inject(StorageService);
  private authService = inject(AuthService);
  private themeService = inject(ThemeService);
  private notifyService = inject(NotifyService);
  private profileSearchService = inject(ProfileSearchService);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);

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
  contextMenuMessage = signal<ChatMessage | null>(null);
  showMessageContextMenu = signal(false);
  messageContextMenuPosition = signal({ x: 0, y: 0 });
  editingMessageId = signal<string | null>(null);
  editingMessageContent = signal("");
  isMobile = signal(typeof window !== "undefined" && window.innerWidth < 768);
  showEmojiPicker = signal(false);
  showAttachmentMenu = signal(false);
  showDetailsMenu = signal(false);
  members = signal<any[]>([]);
  activeEmojiTab = signal<EmojiTab>("smileys");
  recentEmojis = signal<string[]>([]);
  showAddMembersDropdown = signal(false);
  addMembersSearch = signal("");
  selectedAddMembers = signal<string[]>([]);
  groupOwnerId = signal<string | null>(null);

  smileysEmojis = SMILEYS_EMOJIS;
  gesturesEmojis = GESTURES_EMOJIS;
  objectsEmojis = OBJECTS_EMOJIS;
  recentEmojisDefault = RECENT_EMOJIS_DEFAULT;

  filterType = signal<FilterType>("all");
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

  addMembersSearchResults = computed(() => {
    const search = this.addMembersSearch().toLowerCase();
    const allProfiles = this.profileSearchService.profiles();
    const currentMembers = this.members().map((m) => m.id);
    const currentUserId = this.currentUserId();

    return allProfiles.filter((u: Profile) => {
      if (u.user_id === currentUserId) return false;
      if (currentMembers.includes(u.user_id)) return false;
      if (!search) return true;
      return `${u.name} ${u.last_name}`.toLowerCase().includes(search);
    });
  });

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

  closeMessageContextMenu(): void {
    this.showMessageContextMenu.set(false);
    this.contextMenuMessage.set(null);
  }

  onMessageContextMenu(event: MouseEvent, message: ChatMessage): void {
    event.preventDefault();
    event.stopPropagation();
    if (!message.isMine) return;
    this.contextMenuMessage.set(message);
    this.messageContextMenuPosition.set({ x: event.clientX, y: event.clientY });
    this.showMessageContextMenu.set(true);
  }

  startEditMessage(): void {
    const msg = this.contextMenuMessage();
    if (!msg) return;
    this.editingMessageId.set(msg.id);
    this.editingMessageContent.set(msg.content);
    this.closeMessageContextMenu();
  }

  cancelEditMessage(): void {
    this.editingMessageId.set(null);
    this.editingMessageContent.set("");
  }

  saveEditMessage(): void {
    const msgId = this.editingMessageId();
    const content = this.editingMessageContent().trim();
    if (!msgId || !content) {
      this.cancelEditMessage();
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
          this.messages.update((msgs) =>
            msgs.map((m) => (m.id === msgId ? { ...m, content: content, isEdited: true } : m))
          );
          this.cancelEditMessage();
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to edit message");
          this.cancelEditMessage();
        },
      });
  }

  deleteMessage(): void {
    const msg = this.contextMenuMessage();
    if (!msg) return;

    this.requestService
      .invokeCommand("hard_delete_message", {
        id: msg.id,
        token: this.authService.getToken(),
      })
      .subscribe({
        next: () => {
          this.messages.update((msgs) => msgs.filter((m) => m.id !== msg.id));
          this.closeMessageContextMenu();
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to delete message");
          this.closeMessageContextMenu();
        },
      });
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
      this.requestService
        .invokeCommand("delete_group_cascade", {
          id: conv.roomId,
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
        .invokeCommand("hard_delete_room_messages", {
          roomId: conv.roomId,
          token: this.authService.getToken(),
        })
        .subscribe({
          next: () => {
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
    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const userId = params["userId"];
      if (userId) {
        this.openConversationWithUserId(userId);
      }
    });

    this.loadAllUsers();
    if (typeof window !== "undefined") {
      window.addEventListener("resize", () => {
        this.isMobile.set(window.innerWidth < 768);
      });
    }
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom && this.scrollSentinel) {
      this.scrollSentinel.nativeElement.scrollIntoView({ behavior: "smooth" });
      this.shouldScrollToBottom = false;
    }
  }

  private openConversationWithUserId(userId: string): void {
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
        user_id: userId,
        token: this.authService.getToken(),
        visibility: "public",
      })
      .subscribe({
        next: (profile: any) => {
          if (profile) {
            this.startConversationWithUser(profile);
          }
        },
        error: () => {
          this.notifyService.showError("Failed to load user profile");
        },
      });
  }

  private loadAllUsers(): void {
    this.profileSearchService.loadInitial().subscribe({
      next: () => {
        this.loadRooms();
        this.updateConversationsWithProfiles();
      },
      error: () => {
        this.loadRooms();
      },
    });
  }

  private updateConversationsWithProfiles(): void {
    const profiles = this.profileSearchService.profiles();
    if (profiles.length === 0) return;

    this.conversations.update((convs) =>
      convs.map((conv) => {
        if (conv.isGroup) return conv;

        const otherUserId =
          conv.otherUserId || (conv.roomId.startsWith("dm_") ? conv.roomId.substring(3) : null);
        if (!otherUserId) return conv;

        const profile = profiles.find((p) => p.user_id === otherUserId);
        if (profile && conv.name === "Unknown") {
          return {
            ...conv,
            name: this.getProfileDisplayName(profile),
            avatar: profile.image_url || null,
          };
        }
        return conv;
      })
    );
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

    const roomId = crypto.randomUUID();
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
    return getProfileDisplayName(profile);
  }

  private getProfileByUserId(userId: string): Profile | undefined {
    const profiles = this.profileSearchService.profiles();
    return profiles.find((p) => p.user_id === userId);
  }

  private fetchProfileIfMissing(userId: string): void {
    if (!this.getProfileByUserId(userId)) {
      this.requestService
        .invokeCommand("get_profile", {
          user_id: userId,
          token: this.authService.getToken(),
          visibility: "public",
        })
        .subscribe({
          next: (profile: any) => {
            if (profile?.user_id) {
              this.profileSearchService.addProfile(profile);
            }
          },
          error: () => {},
        });
    }
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
    this.showEmojiPicker.set(false);
    this.showAttachmentMenu.set(false);
    this.showDetailsMenu.set(false);
  }

  toggleDetailsPanel(): void {
    this.showDetailsPanel.update((v) => !v);
    if (this.showDetailsPanel()) {
      this.showDetailsMenu.set(false);
      this.loadMembers();
    }
  }

  toggleDetailsMenu(): void {
    this.showDetailsMenu.update((v) => !v);
    this.showEmojiPicker.set(false);
    this.showAttachmentMenu.set(false);
  }

  toggleEmojiPicker(): void {
    this.showEmojiPicker.update((v) => !v);
    this.showAttachmentMenu.set(false);
    this.showDetailsMenu.set(false);
  }

  toggleAttachmentMenu(): void {
    this.showAttachmentMenu.update((v) => !v);
    this.showEmojiPicker.set(false);
    this.showDetailsMenu.set(false);
  }

  addEmoji(emoji: string): void {
    this.messageInput.update((current) => current + emoji);
    this.recentEmojis.update((recent) => {
      const filtered = recent.filter((e) => e !== emoji);
      return [emoji, ...filtered].slice(0, 20);
    });
    this.activeEmojiTab.set("recent");
    this.showEmojiPicker.set(false);
  }

  setEmojiTab(tab: EmojiTab): void {
    this.activeEmojiTab.set(tab);
  }

  private loadMembers(): void {
    const conv = this.activeConversation();
    if (!conv) return;

    const memberIds = conv.memberIds || [];
    const profiles = this.profileSearchService.profiles();
    const membersList: any[] = [];

    for (const memberId of memberIds) {
      const profile = profiles.find((p) => p.user_id === memberId);
      if (profile) {
        membersList.push({
          id: profile.user_id,
          name: this.getProfileDisplayName(profile),
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

    this.members.set(membersList);
    this.loadGroupOwner();
  }

  private loadGroupOwner(): void {
    const conv = this.activeConversation();
    if (!conv || !conv.isGroup) {
      this.groupOwnerId.set(null);
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
            this.groupOwnerId.set(result.data.owner_id);
          }
        },
        error: () => {
          this.groupOwnerId.set(null);
        },
      });
  }

  isCurrentUserOwner(): boolean {
    const ownerId = this.groupOwnerId();
    const currentUserId = this.currentUserId();
    return ownerId !== null && ownerId === currentUserId;
  }

  openAddMembersDropdown(): void {
    this.showAddMembersDropdown.set(true);
    this.addMembersSearch.set("");
    this.selectedAddMembers.set([]);
    this.profileSearchService.loadInitial().subscribe();
  }

  closeAddMembersDropdown(): void {
    this.showAddMembersDropdown.set(false);
    this.addMembersSearch.set("");
    this.selectedAddMembers.set([]);
  }

  isUserSelectedForAdd(userId: string): boolean {
    return this.selectedAddMembers().includes(userId);
  }

  toggleUserForAdd(userId: string): void {
    this.selectedAddMembers.update((ids) =>
      ids.includes(userId) ? ids.filter((id) => id !== userId) : [...ids, userId]
    );
  }

  addMembersToGroup(): void {
    const conv = this.activeConversation();
    if (!conv || !conv.isGroup || this.selectedAddMembers().length === 0) return;

    const memberIds = this.selectedAddMembers();
    console.log("[DEBUG addMembersToGroup] memberIds:", memberIds);

    this.requestService
      .invokeCommand("add_group_members", {
        id: conv.roomId,
        memberIds: memberIds,
        token: this.authService.getToken(),
      })
      .subscribe({
        next: () => {
          this.notifyService.showSuccess("Members added successfully");
          const newMemberIds = [...conv.memberIds, ...this.selectedAddMembers()];
          this.conversations.update((convs) =>
            convs.map((c) =>
              c.roomId === conv.roomId
                ? { ...c, memberIds: newMemberIds, memberCount: newMemberIds.length }
                : c
            )
          );
          this.closeAddMembersDropdown();
          this.loadMembers();
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to add members");
        },
      });
  }

  removeMemberFromGroup(memberId: string): void {
    const conv = this.activeConversation();
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
          this.conversations.update((convs) =>
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
        } else {
          this.fetchProfileIfMissing(otherUserId);
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

      const roomId = chat.room_id;
      if (!roomId) continue;

      if (!convMap.has(roomId)) {
        let name = "Unknown";
        let avatar: string | null = null;
        let isGroup = roomId.startsWith("group_");
        let memberIds: string[] = [];
        let otherUserId: string | undefined;

        if (!isGroup) {
          otherUserId = chat.sender_id !== currentUserId ? chat.sender_id : undefined;
          if (otherUserId) {
            const profile = this.getProfileByUserId(otherUserId);
            if (profile) {
              name = this.getProfileDisplayName(profile);
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

        convMap.set(roomId, {
          roomId: roomId,
          name: name,
          avatar: avatar,
          isOnline: false,
          isTyping: false,
          isGroup: isGroup,
          unreadCount: 0,
          lastMessage: chat.content || "",
          lastMessageTime: this.formatDate(chat.created_at || ""),
          memberIds: memberIds,
          memberCount: memberIds.length,
          bio: "",
          otherUserId: otherUserId,
        });
      }

      const conv = convMap.get(roomId)!;
      conv.lastMessage = chat.content;
      conv.lastMessageTime = this.formatDate(chat.created_at || "");

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
                  lastMessageTime: this.formatDate(group.created_at || ""),
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
              time: this.formatDate(chat.created_at || ""),
              isMine: chat.sender_id === currentUserId,
              isEdited: chat.is_edited === true,
              readStatus: readStatus,
            });
          }

          this.messages.set(msgs);
          this.shouldScrollToBottom = true;
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

  private formatDate(dateStr: string): string {
    return formatTime(dateStr);
  }

  isTimeGapLarge(time1: string, time2: string): boolean {
    if (!time1 || !time2) return false;
    const date1 = new Date(time1);
    const date2 = new Date(time2);
    const diffMs = Math.abs(date2.getTime() - date1.getTime());
    return diffMs > 5 * 60 * 1000;
  }

  onEditKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      this.saveEditMessage();
    } else if (event.key === "Escape") {
      this.cancelEditMessage();
    }
  }
}
