import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  DestroyRef,
  ViewChild,
  ElementRef,
  AfterViewChecked,
  AfterViewInit,
  ChangeDetectionStrategy,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { MatIconModule } from "@angular/material/icon";
import { ChatMessageComponent } from "@components/chat-message/chat-message.component";
import { ChatMessageGroupComponent } from "@components/chat-message-group/chat-message-group.component";
import { ChatState } from "./state/chat.state";
import { ChatService } from "./services/chat.service";
import { ChatSidebarComponent } from "./components/chat-sidebar/chat-sidebar.component";
import { ChatHeaderComponent } from "./components/chat-header/chat-header.component";
import { ChatInputComponent } from "./components/chat-input/chat-input.component";
import { ChatDetailsComponent } from "./components/chat-details/chat-details.component";
import { TypingIndicatorComponent } from "./components/typing-indicator/typing-indicator.component";
import { DateAnchorComponent } from "./components/date-anchor/date-anchor.component";
import { UserAvatarComponent } from "@components/user-avatar/user-avatar.component";
import { ConversationItem, ChatMessage } from "@entities/chat.model";
import { EmojiTab, FilterType } from "@entities/chat.model";
import { Profile } from "@entities/generated/api.types";
import {
  SMILEYS_EMOJIS,
  GESTURES_EMOJIS,
  OBJECTS_EMOJIS,
  RECENT_EMOJIS_DEFAULT,
} from "@shared/utils/constants";
import { AppButtonComponent } from "@components/shared/button/button.component";
@Component({
  selector: "app-chat",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    ChatMessageComponent,
    ChatMessageGroupComponent,
    ChatSidebarComponent,
    ChatHeaderComponent,
    ChatInputComponent,
    ChatDetailsComponent,
    TypingIndicatorComponent,
    DateAnchorComponent,
    UserAvatarComponent,
    AppButtonComponent,
  ],
  templateUrl: "./chat.page.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatView implements OnInit, AfterViewChecked, AfterViewInit, OnDestroy {
  @ViewChild("scrollSentinel") scrollSentinel?: ElementRef<HTMLDivElement>;
  @ViewChild("messagesContainer") messagesContainer?: ElementRef<HTMLDivElement>;
  private shouldScrollToBottom = false;
  chatService = inject(ChatService);
  state = inject(ChatState);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);
  private scrollHandler = () => this.onMessagesScroll();
  private scrollRAF: number | null = null;
  private readonly MAX_PAGINATION_PAGES = 10;
  private isLoadingPreviousMessages = false;
  private debounceTimeout: any = null;
  smileysEmojis = SMILEYS_EMOJIS;
  gesturesEmojis = GESTURES_EMOJIS;
  objectsEmojis = OBJECTS_EMOJIS;
  recentEmojisDefault = RECENT_EMOJIS_DEFAULT;
  ngOnInit(): void {
    let pendingUserId: string | null = null;
    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const userId = params["userId"];
      if (userId) {
        pendingUserId = userId;
        this.tryOpenPendingConversation(pendingUserId!);
      }
    });
    this.chatService.loadAllUsers();
  }
  private tryOpenPendingConversation(userId: string): void {
    const profiles = this.chatService.getLoadedProfiles();
    if (profiles.length > 0) {
      this.chatService.openConversationWithUserId(userId);
    } else {
      setTimeout(() => this.tryOpenPendingConversation(userId), 100);
    }
  }
  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom && this.scrollSentinel) {
      this.scrollSentinel.nativeElement.scrollIntoView({ behavior: "smooth" });
      this.shouldScrollToBottom = false;
    }
  }
  ngAfterViewInit(): void {
    this.messagesContainer?.nativeElement.addEventListener("scroll", this.scrollHandler, {
      passive: true,
    });
    window.addEventListener("resize", this.onWindowResize);
  }
  ngOnDestroy(): void {
    if (this.messagesContainer?.nativeElement) {
      this.messagesContainer.nativeElement.removeEventListener("scroll", this.scrollHandler);
    }
    window.removeEventListener("resize", this.onWindowResize);
    if (this.scrollRAF) {
      cancelAnimationFrame(this.scrollRAF);
    }
    this.state.resetStickySender();
  }
  private onWindowResize = () => {
    this.state.updateWindowWidth();
  };
  onMessagesScroll(): void {
    if (this.scrollRAF) {
      cancelAnimationFrame(this.scrollRAF);
    }
    this.scrollRAF = requestAnimationFrame(() => {
      this.updateStickyAvatar();
      if (this.debounceTimeout) {
        clearTimeout(this.debounceTimeout);
      }
      this.debounceTimeout = setTimeout(() => {
        const container = this.messagesContainer?.nativeElement;
        if (!container) return;
        const scrollTop = container.scrollTop;
        if (scrollTop < 50) {
          this.loadPreviousMessages();
        }
      }, 200);
    });
  }
  updateStickyAvatar(): void {
    const container = this.messagesContainer?.nativeElement;
    if (!container) return;
    const scrollTop = container.scrollTop;
    const clientHeight = container.clientHeight;
    const scrollHeight = container.scrollHeight;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    this.state.setScrolledToBottom(isNearBottom);
    if (isNearBottom) {
      const messages = this.state.activeMessages();
      if (messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        this.state.updateStickySender(
          lastMsg.senderId,
          lastMsg.senderName,
          lastMsg.senderAvatar || null
        );
      }
      return;
    }
    const messageElements = container.querySelectorAll(".group-message");
    let topmostSenderId: string | null = null;
    let topmostSenderName = "";
    let topmostSenderAvatar: string | null = null;
    let topmostBottom = -1;
    messageElements.forEach((el, idx) => {
      const rect = el.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const relativeTop = rect.top - containerRect.top;
      const relativeBottom = rect.bottom - containerRect.top;
      if (relativeTop < clientHeight && relativeBottom > 0) {
        if (relativeBottom > topmostBottom) {
          topmostBottom = relativeBottom;
          const messages = this.state.activeMessages();
          const msg = messages[idx];
          if (msg) {
            topmostSenderId = msg.senderId;
            topmostSenderName = msg.senderName;
            topmostSenderAvatar = msg.senderAvatar || null;
          }
        }
      }
    });
    if (topmostSenderId) {
      this.state.updateStickySender(topmostSenderId, topmostSenderName, topmostSenderAvatar);
    }
  }
  onConversationContextMenu(event: { event: MouseEvent; conv: ConversationItem }): void {
    event.event.preventDefault();
    this.state.contextMenuConversation.set(event.conv);
    this.state.contextMenuPosition.set({ x: event.event.clientX, y: event.event.clientY });
    this.state.showContextMenu.set(true);
  }
  closeContextMenu(): void {
    this.state.showContextMenu.set(false);
    this.state.contextMenuConversation.set(null);
  }
  closeMessageContextMenu(): void {
    this.state.showMessageContextMenu.set(false);
    this.state.contextMenuMessage.set(null);
    this.state.contextMenuMessageId.set(null);
  }
  onMessageContextMenu(payload: { event: MouseEvent; message: ChatMessage; isOwn: boolean }): void {
    if (!payload.isOwn) return;
    this.state.contextMenuMessage.set(payload.message);
    this.state.contextMenuMessageId.set(payload.message.id);
    this.state.contextMenuIsOwnMessage.set(payload.isOwn);
    this.state.messageContextMenuPosition.set({
      x: payload.event.clientX,
      y: payload.event.clientY,
    });
    this.state.showMessageContextMenu.set(true);
  }
  startEditMessage(message?: ChatMessage): void {
    const msg = message || this.state.contextMenuMessage();
    if (!msg) return;
    this.state.editingMessageId.set(msg.id);
    this.state.editingMessageContent.set(msg.content);
  }
  cancelEditMessage(): void {
    this.state.cancelEditMessage();
  }
  saveEditMessage(): void {
    this.chatService.saveEditMessage();
  }
  deleteMessage(message?: ChatMessage): void {
    const msg = message || this.state.contextMenuMessage();
    if (!msg) return;
    this.chatService.deleteMessageById(msg.id);
    if (this.state.contextMenuMessage()?.id === msg.id) {
      this.state.closeMessageContextMenu();
    }
  }
  removeConversation(): void {
    this.chatService.removeConversation();
  }
  togglePinConversation(): void {
    this.chatService.togglePinConversation();
  }
  toggleMuteConversation(): void {
    this.chatService.toggleMuteConversation();
  }
  markAsReadConversation(): void {
    this.chatService.markAsReadConversation();
  }
  selectConversation(conv: ConversationItem): void {
    this.shouldScrollToBottom = true;
    this.state.resetStickySender();
    this.state.messagesPagination.set({ skip: 0, limit: 100, hasMore: true, loading: false });
    this.chatService.selectConversation(conv);
  }
  loadInitialMessages(roomId: string): void {
    this.state.messagesPagination.set({ skip: 0, limit: 100, hasMore: true, loading: true });
    this.chatService.loadMessagesForRoom(roomId, 0, 100);
    this.state.messagesPagination.update((p) => ({
      ...p,
      skip: 100,
      hasMore: true,
      loading: false,
    }));
  }
  loadPreviousMessages(): void {
    if (this.isLoadingPreviousMessages) return;
    const pagination = this.state.messagesPagination();
    if (pagination.loading || !pagination.hasMore) return;
    const currentPage = pagination.skip / pagination.limit;
    if (currentPage >= this.MAX_PAGINATION_PAGES - 1) {
      this.state.messagesPagination.update((p) => ({ ...p, hasMore: false }));
      return;
    }
    const roomId = this.state.activeConversationId();
    if (!roomId) return;
    this.isLoadingPreviousMessages = true;
    this.state.isLoadingPreviousMessages.set(true);
    const previousScrollHeight = this.messagesContainer?.nativeElement?.scrollHeight || 0;
    this.chatService
      .loadPreviousMessagesForRoom(roomId, pagination.skip, pagination.limit)
      .subscribe({
        next: (olderMessages: ChatMessage[]) => {
          if (olderMessages.length === 0) {
            this.state.messagesPagination.update((p) => ({ ...p, hasMore: false, loading: false }));
            this.isLoadingPreviousMessages = false;
            this.state.isLoadingPreviousMessages.set(false);
            return;
          }
          this.state.messages.update((existing) => [...olderMessages, ...existing]);
          this.state.messagesPagination.update((p) => ({
            ...p,
            skip: p.skip + olderMessages.length,
            hasMore: olderMessages.length >= p.limit,
            loading: false,
          }));
          if (this.messagesContainer?.nativeElement && previousScrollHeight > 0) {
            const newScrollHeight = this.messagesContainer.nativeElement.scrollHeight;
            this.messagesContainer.nativeElement.scrollTop +=
              newScrollHeight - previousScrollHeight;
          }
          this.isLoadingPreviousMessages = false;
          this.state.isLoadingPreviousMessages.set(false);
        },
        error: () => {
          this.isLoadingPreviousMessages = false;
          this.state.isLoadingPreviousMessages.set(false);
        },
      });
  }
  closeConversation(): void {
    this.state.activeConversationId.set(null);
    this.state.messages.set([]);
    if (!this.state.isMobile()) {
      this.state.showSidebar.set(true);
    }
    this.state.showEmojiPicker.set(false);
    this.state.showAttachmentMenu.set(false);
    this.state.showDetailsMenu.set(false);
  }
  onSearchChange(value: string): void {
    this.state.userDropdownSearch.set(value);
    this.state.searchQuery.set(value);
  }
  onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
    }
  }
  onSearchFocus(): void {
    this.state.showSearchDropdown.set(true);
  }
  onSearchBlur(): void {
    setTimeout(() => {
      this.state.showSearchDropdown.set(false);
    }, 200);
  }
  onSearchDropdownScroll(event: Event): void {
    const target = event.target as HTMLElement;
    const isNearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 100;
    if (isNearBottom && this.state.hasMoreProfiles() && !this.state.isProfilesLoading()) {
      this.state.profileSearchServiceRef?.loadMore?.()?.subscribe();
    }
  }
  loadMoreProfiles(): void {
    this.state.profileSearchServiceRef?.loadMore?.()?.subscribe();
  }
  toggleUserDropdown(): void {
    if (this.state.showUserDropdown()) {
      this.state.showUserDropdown.set(false);
    } else {
      this.chatService.loadAllUsers();
      this.state.showUserDropdown.set(true);
    }
  }
  closeUserDropdown(): void {
    this.state.closeUserDropdown();
  }
  startConversationWithUser(profile: Profile): void {
    this.chatService.startConversationWithUser(profile);
  }
  filterChats(type: FilterType): void {
    this.state.filterType.set(type);
  }
  openCreateGroup(): void {
    this.state.showCreateGroupModal.set(true);
  }
  createGroup(name: string): void {
    this.chatService.createGroup(name);
  }
  closeCreateGroup(): void {
    this.state.newGroupName.set("");
    this.state.showCreateGroupModal.set(false);
  }
  onMessageInputChange(value: string): void {
    this.state.messageInput.set(value);
  }
  onInputKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }
  sendMessage(): void {
    const content = this.state.messageInput().trim();
    if (!content) return;
    this.chatService.sendMessage(content);
  }
  addEmoji(emoji: string): void {
    this.state.messageInput.update((current) => current + emoji);
    this.state.recentEmojis.update((recent) => {
      const filtered = recent.filter((e) => e !== emoji);
      return [emoji, ...filtered].slice(0, 20);
    });
    this.state.activeEmojiTab.set("recent");
    this.state.showEmojiPicker.set(false);
  }
  setEmojiTab(tab: EmojiTab): void {
    this.state.setEmojiTab(tab);
  }
  openAddMembersDropdown(): void {
    this.state.showAddMembersDropdown.set(true);
    this.state.addMembersSearch.set("");
    this.state.selectedAddMembers.set([]);
  }
  closeAddMembersDropdown(): void {
    this.state.closeAddMembersDropdown();
  }
  isUserSelectedForAdd(userId: string): boolean {
    return this.state.selectedAddMembers().includes(userId);
  }
  toggleUserForAdd(userId: string): void {
    this.state.selectedAddMembers.update((ids) =>
      ids.includes(userId) ? ids.filter((id) => id !== userId) : [...ids, userId]
    );
  }
  addMembersToGroup(): void {
    this.chatService.addMembersToGroup();
  }
  removeMemberFromGroup(memberId: string): void {
    this.chatService.removeMemberFromGroup(memberId);
  }
  leaveGroup(): void {
    this.chatService.removeConversation();
  }
  onEditKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      this.saveEditMessage();
    } else if (event.key === "Escape") {
      this.cancelEditMessage();
    }
  }
  isTimeGapLarge(time1: string, time2: string): boolean {
    return this.state.isTimeGapLarge(time1, time2);
  }
  onReplyMessage(message: ChatMessage): void {
    this.state.setReplyTo(message);
  }
  onReactToMessage(payload: { message: ChatMessage; emoji: string }): void {
    if (payload.emoji) {
      this.chatService.addReaction(payload.message.id, payload.emoji);
    }
  }
  onRemoveReaction(payload: { message: ChatMessage; emoji: string }): void {
    this.chatService.removeReaction(payload.message.id, payload.emoji);
  }
  onCancelReply(message: ChatMessage): void {
    if (this.state.replyToMessage()?.id === message.id) {
      this.state.setReplyTo(null);
    }
  }
  onCancelReplyAction(): void {
    this.state.setReplyTo(null);
  }
  onRetrySendMessage(message: ChatMessage): void {
    if (!message.tempId || message.syncStatus !== "failed") return;
    this.chatService.retrySendMessage(message.tempId);
  }
  get typingIndicatorVisible(): boolean {
    return !!(this.state.isSomeoneTyping() && this.state.activeConversation()?.isTyping);
  }
  get typingUserName(): string {
    return this.state.typingUserName();
  }
  get groupedMessages(): { messages: ChatMessage[]; isOwn: boolean }[] {
    const msgs = this.state.activeMessages();
    if (msgs.length === 0) return [];
    const groups: { messages: ChatMessage[]; isOwn: boolean }[] = [];
    let currentGroup: ChatMessage[] = [];
    let currentSenderId = "";
    let currentIsOwn = false;
    for (const msg of msgs) {
      const isTimeGap = this.isTimeGapLarge(
        currentGroup[currentGroup.length - 1]?.time || "",
        msg.time
      );
      if (currentGroup.length === 0 || (currentSenderId === msg.senderId && !isTimeGap)) {
        currentGroup.push(msg);
      } else {
        if (currentGroup.length > 0) {
          groups.push({
            messages: [...currentGroup],
            isOwn: currentIsOwn,
          });
        }
        currentGroup = [msg];
      }
      currentSenderId = msg.senderId;
      currentIsOwn = msg.isMine;
    }
    if (currentGroup.length > 0) {
      groups.push({
        messages: [...currentGroup],
        isOwn: currentIsOwn,
      });
    }
    return groups;
  }
  get replyToMessage(): ChatMessage | null {
    return this.state.replyToMessage();
  }
  isSameDay(time1: string, time2: string): boolean {
    if (!time1 || !time2) return true;
    const d1 = new Date(time1);
    const d2 = new Date(time2);
    return d1.toDateString() === d2.toDateString();
  }
  formatMessageDate(time: string): string {
    if (!time) return "";
    const date = new Date(time);
    if (isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  getContextMenuTransform(): string {
    const pos = this.state.contextMenuPosition();
    const menuWidth = 200;
    const menuHeight = 200;
    const padding = 16;
    let x = pos.x;
    let y = pos.y;
    if (typeof window !== "undefined") {
      if (x + menuWidth > window.innerWidth - padding) {
        x = window.innerWidth - menuWidth - padding;
      }
      if (y + menuHeight > window.innerHeight - padding) {
        y = window.innerHeight - menuHeight - padding;
      }
    }
    return `translate(${Math.max(padding, x)}px, ${Math.max(padding, y)}px)`;
  }
  getMessageContextMenuTransform(): string {
    const pos = this.state.messageContextMenuPosition();
    const menuWidth = 180;
    const menuHeight = 100;
    const padding = 16;
    const gap = 12;
    let x = pos.x;
    let y = pos.y + gap;
    const isOwn = this.state.contextMenuIsOwnMessage();
    if (isOwn) {
      x = pos.x - menuWidth + 40;
    } else {
      x = pos.x - 40;
    }
    if (y + menuHeight > window.innerHeight - padding) {
      y = pos.y - menuHeight - gap;
    }
    if (y < padding) y = padding;
    if (x < padding) x = padding;
    if (x + menuWidth > window.innerWidth - padding) {
      x = window.innerWidth - menuWidth - padding;
    }
    return `translate(${x}px, ${y}px)`;
  }
  openSidebar(): void {
    this.state.showSidebar.set(true);
  }
  openSidebarForMobile(): void {
    this.state.showSidebar.set(true);
  }
  openDetailsPanel(): void {
    this.state.showDetailsPanel.set(true);
  }
  closeDetailsPanel(): void {
    this.state.showDetailsPanel.set(false);
  }
  closeSidebarForMobile(): void {
    this.state.showSidebar.set(false);
  }
  collapseSidebar(): void {
    this.state.sidebarCollapsed.set(true);
  }
  expandSidebar(): void {
    this.state.sidebarCollapsed.set(false);
  }
}
