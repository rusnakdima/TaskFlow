import { Injectable, signal, computed } from "@angular/core";
import { ConversationItem, ChatMessage, FilterType, EmojiTab } from "@models/chat.model";
import { Profile } from "@models/generated/api.types";
import { AuthService } from "@services/auth/auth.service";
import { ThemeService } from "@services/ui/theme.service";
import { ProfileSearchService } from "@services/core/profile-search.service";
import { formatTime } from "@utils/format-time.util";

@Injectable({ providedIn: "root" })
export class ChatState {
  constructor(
    private authService: AuthService,
    private themeService: ThemeService,
    private profileSearchService: ProfileSearchService
  ) {}

  get profileSearchServiceRef() {
    return this.profileSearchService;
  }

  conversations = signal<ConversationItem[]>([]);
  activeConversationId = signal<string | null>(null);
  messages = signal<ChatMessage[]>([]);

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

  private windowWidth = signal(typeof window !== "undefined" ? window.innerWidth : 1024);
  isMobile = computed(() => this.windowWidth() < 768);

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

  filterType = signal<FilterType>("all");
  searchQuery = signal("");
  messageInput = signal("");
  newGroupName = signal("");

  replyToMessage = signal<ChatMessage | null>(null);
  isSomeoneTyping = signal(false);
  typingUserName = signal("");

  stickySenderId = signal<string | null>(null);
  stickySenderName = signal("");
  stickySenderAvatar = signal<string | null>(null);
  isScrolledToBottom = signal(true);

  messagesPagination = signal<{
    skip: number;
    limit: number;
    hasMore: boolean;
    loading: boolean;
  }>({ skip: 0, limit: 100, hasMore: true, loading: false });

  isLoadingPreviousMessages = signal(false);

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

  isTimeGapLarge(time1: string, time2: string): boolean {
    if (!time1 || !time2) return false;
    const date1 = new Date(time1);
    const date2 = new Date(time2);
    const diffMs = Math.abs(date2.getTime() - date1.getTime());
    return diffMs > 5 * 60 * 1000;
  }

  formatDate(dateStr: string): string {
    return formatTime(dateStr);
  }

  closeContextMenu(): void {
    this.showContextMenu.set(false);
    this.contextMenuConversation.set(null);
  }

  closeMessageContextMenu(): void {
    this.showMessageContextMenu.set(false);
    this.contextMenuMessage.set(null);
  }

  cancelEditMessage(): void {
    this.editingMessageId.set(null);
    this.editingMessageContent.set("");
  }

  closeUserDropdown(): void {
    this.showUserDropdown.set(false);
    this.userDropdownSearch.set("");
  }

  closeAddMembersDropdown(): void {
    this.showAddMembersDropdown.set(false);
    this.addMembersSearch.set("");
    this.selectedAddMembers.set([]);
  }

  toggleDetailsPanel(): void {
    this.showDetailsPanel.update((v) => !v);
    if (this.showDetailsPanel()) {
      this.showDetailsMenu.set(false);
    }
  }

  toggleDetailsMenu(): void {
    this.showDetailsMenu.update((v) => !v);
    this.showEmojiPicker.set(false);
    this.showAttachmentMenu.set(false);
  }

  closeDetailsMenu(): void {
    this.showDetailsMenu.set(false);
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

  setEmojiTab(tab: EmojiTab): void {
    this.activeEmojiTab.set(tab);
  }

  setReplyTo(message: ChatMessage | null): void {
    this.replyToMessage.set(message);
  }

  setTypingIndicator(isTyping: boolean, userName = ""): void {
    this.isSomeoneTyping.set(isTyping);
    this.typingUserName.set(userName);
  }

  updateStickySender(senderId: string, senderName: string, senderAvatar: string | null): void {
    if (this.stickySenderId() !== senderId) {
      this.stickySenderId.set(senderId);
      this.stickySenderName.set(senderName);
      this.stickySenderAvatar.set(senderAvatar);
    }
  }

  setScrolledToBottom(isBottom: boolean): void {
    this.isScrolledToBottom.set(isBottom);
  }

  resetStickySender(): void {
    this.stickySenderId.set(null);
    this.stickySenderName.set("");
    this.stickySenderAvatar.set(null);
  }

  updateWindowWidth(): void {
    this.windowWidth.set(window.innerWidth);
  }
}
