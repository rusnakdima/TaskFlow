/* sys lib */
import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  effect,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Chat } from "@models/chat.model";
import { Profile } from "@models/profile.model";

/* services */
import { StorageService } from "@services/storage.service";
import { REQUEST_SERVICE } from "@services/api.service";
import { AuthService } from "@services/auth/auth.service";
import { NotifyService } from "@services/notifications/notify.service";

export interface ConversationUser {
  userId: string;
  username: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount: number;
}

export interface ChatMessage {
  id: string;
  content: string;
  author_name?: string;
  user_id: string;
  created_at: string;
  isMine: boolean;
}

@Component({
  selector: "app-chat-window",
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: "./chat-window.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatWindowComponent {
  @Input() set chats(value: Chat[]) {
    this._chats.set(value);
    this.buildConversations();
    this.buildRecentChatUserIds();
  }
  @Output() messageSent = new EventEmitter<Chat>();
  @Output() conversationSelected = new EventEmitter<string>();

  private storageService = inject(StorageService);
  private requestService = inject(REQUEST_SERVICE);
  private authService = inject(AuthService);
  private notifyService = inject(NotifyService);

  private _chats = signal<Chat[]>([]);
  conversations = signal<ConversationUser[]>([]);
  selectedConversation = signal<ConversationUser | null>(null);
  messages = signal<ChatMessage[]>([]);
  newMessage = signal("");

  showNewConversationPanel = signal(false);
  newConversationSearch = signal("");
  publicProfiles = signal<Profile[]>([]);
  recentChatUserIds = signal<string[]>([]);

  currentUserId = computed(() => this.authService.getValueByKey("id"));

  filteredProfilesForNewChat = computed(() => {
    const query = this.newConversationSearch().toLowerCase();
    const currentUserId = this.currentUserId();
    const allProfiles = this.publicProfiles();
    const recentIds = this.recentChatUserIds();

    if (query.length < 3) {
      const recentProfiles = allProfiles.filter(
        (p) => p.user_id !== currentUserId && recentIds.includes(p.user_id)
      );
      const otherProfiles = allProfiles.filter(
        (p) => p.user_id !== currentUserId && !recentIds.includes(p.user_id)
      );
      return { recentProfiles, otherProfiles, hasSearch: false };
    }

    const filtered = allProfiles.filter((p) => {
      if (p.user_id === currentUserId) return false;
      const nameMatch =
        `${p.name} ${p.last_name}`.toLowerCase().includes(query) ||
        p.name.toLowerCase().includes(query) ||
        p.last_name.toLowerCase().includes(query);
      const emailMatch = p.user?.email?.toLowerCase().includes(query);
      return nameMatch || emailMatch;
    });

    return { recentProfiles: [], otherProfiles: filtered, hasSearch: true };
  });

  constructor() {
    effect(() => {
      const panelVisible = this.showNewConversationPanel();
      if (panelVisible) {
        this.loadPublicProfiles();
      }
    });
  }

  selectConversation(conv: ConversationUser): void {
    this.selectedConversation.set(conv);
    this.loadMessagesForUser(conv.userId);
    this.conversationSelected.emit(conv.userId);
  }

  goBack(): void {
    this.selectedConversation.set(null);
  }

  openNewConversationPanel(): void {
    this.showNewConversationPanel.set(true);
    this.loadPublicProfiles();
  }

  closeNewConversationPanel(): void {
    this.showNewConversationPanel.set(false);
    this.newConversationSearch.set("");
  }

  onNewConversationSearchChange(value: string): void {
    this.newConversationSearch.set(value);
  }

  startConversationWith(profile: Profile): void {
    const username = `${profile.name} ${profile.last_name}`.trim();
    this.selectedConversation.set({
      userId: profile.user_id,
      username: username || profile.user?.username || "Unknown",
      unreadCount: 0,
    });
    this.closeNewConversationPanel();
    this.loadMessagesForUser(profile.user_id);
    this.conversationSelected.emit(profile.user_id);
  }

  onMessageChange(value: string): void {
    this.newMessage.set(value);
  }

  sendMessage(): void {
    const content = this.newMessage().trim();
    const conversation = this.selectedConversation();
    if (!content || !conversation) return;

    const chatData = {
      user_id: conversation.userId,
      content,
    };

    this.requestService.create<Chat>("chats", chatData, { visibility: "private" }).subscribe({
      next: (chat) => {
        this.newMessage.set("");
        this.storageService.addChat(chat);
        this.loadMessagesForUser(conversation.userId);
        this.messageSent.emit(chat);
      },
      error: (err) => {
        this.notifyService.showError(err.message || "Failed to send message");
      },
    });
  }

  onInputKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  formatTime(dateStr: string): string {
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

  getUsernameInitials(name: string): string {
    if (!name) return "?";
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }
    return name.charAt(0).toUpperCase();
  }

  trackByUserId(_index: number, conv: ConversationUser): string {
    return conv.userId;
  }

  trackByMessageId(_index: number, msg: ChatMessage): string {
    return msg.id;
  }

  trackByProfileId(_index: number, profile: Profile): string {
    return profile.id;
  }

  private loadPublicProfiles(): void {
    if (this.publicProfiles().length > 0) return;

    this.requestService.getPublicProfiles().subscribe({
      next: (profiles) => {
        this.publicProfiles.set(profiles as Profile[]);
      },
      error: (err) => {
        this.notifyService.showError(err.message || "Failed to load users");
      },
    });
  }

  private buildConversations(): void {
    const chats = this._chats();
    const userId = this.currentUserId();
    if (!userId) return;

    const convMap = new Map<string, ConversationUser>();

    for (const chat of chats) {
      if (chat.deleted_at) continue;
      const otherUserId = chat.user_id === userId ? chat.author_name : chat.user_id;
      const key = otherUserId || "unknown";

      if (!convMap.has(key)) {
        convMap.set(key, {
          userId: key,
          username: chat.user?.username || chat.author_name || "Unknown",
          unreadCount: 0,
        });
      }

      const conv = convMap.get(key)!;
      conv.lastMessage = chat.content;
      conv.lastMessageTime = chat.created_at;

      if (!chat.read_by?.includes(userId)) {
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

  private buildRecentChatUserIds(): void {
    const chats = this._chats();
    const userId = this.currentUserId();
    if (!userId) return;

    const recentIds: string[] = [];
    const seen = new Set<string>();

    const sorted = [...chats]
      .filter((c) => !c.deleted_at)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    for (const chat of sorted) {
      const otherUserId = chat.user_id === userId ? chat.author_name : chat.user_id;
      if (otherUserId && !seen.has(otherUserId)) {
        seen.add(otherUserId);
        recentIds.push(otherUserId);
        if (recentIds.length >= 5) break;
      }
    }

    this.recentChatUserIds.set(recentIds);
  }

  private loadMessagesForUser(userId: string): void {
    const chats = this._chats();
    const currentUserId = this.currentUserId();

    const userChats = chats
      .filter((c) => {
        const otherUserId = c.user_id === currentUserId ? c.author_name : c.user_id;
        return otherUserId === userId && !c.deleted_at;
      })
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((c) => ({
        id: c.id,
        content: c.content,
        author_name: c.author_name,
        user_id: c.user_id,
        created_at: c.created_at,
        isMine: c.user_id === currentUserId,
      }));

    this.messages.set(userChats);
  }
}
