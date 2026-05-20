import {
  Component,
  OnInit,
  inject,
  DestroyRef,
  ViewChild,
  ElementRef,
  AfterViewChecked,
  ChangeDetectionStrategy,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { MatIconModule } from "@angular/material/icon";
import { ChatMessageComponent } from "@components/chat-message/chat-message.component";
import { ChatState } from "./state/chat.state";
import { ChatService } from "./services/chat.service";
import { ChatSidebarComponent } from "./components/chat-sidebar/chat-sidebar.component";
import { ChatHeaderComponent } from "./components/chat-header/chat-header.component";
import { ChatInputComponent } from "./components/chat-input/chat-input.component";
import { ChatDetailsComponent } from "./components/chat-details/chat-details.component";
import { TypingIndicatorComponent } from "./components/typing-indicator/typing-indicator.component";
import { DateAnchorComponent } from "./components/date-anchor/date-anchor.component";
import { ConversationItem, ChatMessage } from "@models/chat.model";
import { EmojiTab, FilterType } from "@models/chat.model";
import { Profile } from "@models/generated/api.types";
import {
  SMILEYS_EMOJIS,
  GESTURES_EMOJIS,
  OBJECTS_EMOJIS,
  RECENT_EMOJIS_DEFAULT,
} from "@constants/emoji.constants";

@Component({
  selector: "app-chat",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    ChatMessageComponent,
    ChatSidebarComponent,
    ChatHeaderComponent,
    ChatInputComponent,
    ChatDetailsComponent,
    TypingIndicatorComponent,
    DateAnchorComponent,
  ],
  templateUrl: "./chat.view.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatView implements OnInit, AfterViewChecked {
  @ViewChild("scrollSentinel") scrollSentinel?: ElementRef<HTMLDivElement>;
  private shouldScrollToBottom = false;
  chatService = inject(ChatService);
  state = inject(ChatState);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);

  smileysEmojis = SMILEYS_EMOJIS;
  gesturesEmojis = GESTURES_EMOJIS;
  objectsEmojis = OBJECTS_EMOJIS;
  recentEmojisDefault = RECENT_EMOJIS_DEFAULT;

  ngOnInit(): void {
    let pendingUserId: string | null = null;

    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const userId = params["userId"];
      console.log("[ChatView] Received userId from queryParams:", userId);
      if (userId) {
        pendingUserId = userId;
        this.tryOpenPendingConversation(pendingUserId!);
      }
    });

    console.log("[ChatView] Calling loadAllUsers...");
    this.chatService.loadAllUsers();
    console.log("[ChatView] loadAllUsers() started");
  }

  private tryOpenPendingConversation(userId: string): void {
    const profiles = this.chatService.getLoadedProfiles();
    console.log(
      "[ChatView] tryOpenPendingConversation, userId:",
      userId,
      "profiles loaded:",
      profiles.length
    );
    if (profiles.length > 0) {
      this.chatService.openConversationWithUserId(userId);
    } else {
      console.log("[ChatView] Profiles not loaded yet, waiting...");
      setTimeout(() => this.tryOpenPendingConversation(userId), 100);
    }
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom && this.scrollSentinel) {
      this.scrollSentinel.nativeElement.scrollIntoView({ behavior: "smooth" });
      this.shouldScrollToBottom = false;
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
  }

  onMessageContextMenu(event: MouseEvent, message: ChatMessage): void {
    if (!message.isMine) return;
    this.state.contextMenuMessage.set(message);
    this.state.messageContextMenuPosition.set({ x: event.clientX, y: event.clientY });
    this.state.showMessageContextMenu.set(true);
  }

  startEditMessage(): void {
    const msg = this.state.contextMenuMessage();
    if (!msg) return;
    this.state.editingMessageId.set(msg.id);
    this.state.editingMessageContent.set(msg.content);
    this.closeMessageContextMenu();
  }

  cancelEditMessage(): void {
    this.state.cancelEditMessage();
  }

  saveEditMessage(): void {
    this.chatService.saveEditMessage();
  }

  deleteMessage(): void {
    this.chatService.deleteMessage();
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
    this.chatService.selectConversation(conv);
  }

  closeConversation(): void {
    this.state.activeConversationId.set(null);
    this.state.messages.set([]);
    this.state.showSidebar.set(true);
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
      this.state.messages.update((msgs) =>
        msgs.map((m) => {
          if (m.id === payload.message.id) {
            const reactions = m.reactions || [];
            const existing = reactions.find((r) => r.emoji === payload.emoji);
            if (existing) {
              return {
                ...m,
                reactions: reactions.map((r) =>
                  r.emoji === payload.emoji ? { ...r, count: r.count + 1, isOwn: true } : r
                ),
              };
            } else {
              return {
                ...m,
                reactions: [...reactions, { emoji: payload.emoji, count: 1, isOwn: true }],
              };
            }
          }
          return m;
        })
      );
    }
  }

  onRemoveReaction(payload: { message: ChatMessage; emoji: string }): void {
    this.state.messages.update((msgs) =>
      msgs.map((m) => {
        if (m.id === payload.message.id) {
          return {
            ...m,
            reactions: (m.reactions || []).filter((r) => r.emoji !== payload.emoji),
          };
        }
        return m;
      })
    );
  }

  onCancelReply(message: ChatMessage): void {
    if (this.state.replyToMessage()?.id === message.id) {
      this.state.setReplyTo(null);
    }
  }

  onCancelReplyAction(): void {
    this.state.setReplyTo(null);
  }

  get typingIndicatorVisible(): boolean {
    return !!(this.state.isSomeoneTyping() && this.state.activeConversation()?.isTyping);
  }

  get typingUserName(): string {
    return this.state.typingUserName();
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
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return "Today";
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    } else {
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
  }
}
