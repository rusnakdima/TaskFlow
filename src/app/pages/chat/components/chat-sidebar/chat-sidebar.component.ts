import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  inject,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { Router, RouterModule } from "@angular/router";
import { ConversationItem, FilterType } from "@entities/chat.model";
import { Profile } from "@entities/generated/api.types";
import { UserAvatarComponent } from "@components/user-avatar/user-avatar.component";

@Component({
  selector: "app-chat-sidebar",
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, RouterModule, UserAvatarComponent],
  templateUrl: "./chat-sidebar.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatSidebarComponent {
  private router = inject(Router);
  @Input() conversations: ConversationItem[] = [];
  @Input() filteredConversations: ConversationItem[] = [];
  @Input() searchQuery = "";
  @Input() filterType: FilterType = "all";
  @Input() showUserDropdown = false;
  @Input() showSearchDropdown = false;
  @Input() userDropdownSearch = "";
  @Input() searchDropdownUsers: { recent: Profile[]; others: Profile[] } = {
    recent: [],
    others: [],
  };
  @Input() isProfilesLoading = false;
  @Input() isSearching = false;
  @Input() hasMoreProfiles = false;
  @Input() showCreateGroupModal = false;
  @Input() newGroupName = "";
  @Input() isMobile = false;
  @Input() isTablet = false;
  @Input() isCollapsed = false;
  @Input() activeConvId: string | null = null;

  @Output() selectConversation = new EventEmitter<ConversationItem>();
  @Output() conversationContextMenu = new EventEmitter<{
    event: MouseEvent;
    conv: ConversationItem;
  }>();
  @Output() searchChange = new EventEmitter<string>();
  @Output() searchKeydown = new EventEmitter<KeyboardEvent>();
  @Output() searchFocus = new EventEmitter<void>();
  @Output() searchBlur = new EventEmitter<void>();
  @Output() searchDropdownScroll = new EventEmitter<Event>();
  @Output() loadMoreProfiles = new EventEmitter<void>();
  @Output() toggleUserDropdown = new EventEmitter<void>();
  @Output() closeUserDropdown = new EventEmitter<void>();
  @Output() toggleUserForAdd = new EventEmitter<string>();
  @Output() startConversationWithUser = new EventEmitter<Profile>();
  @Output() filterChange = new EventEmitter<FilterType>();
  @Output() openCreateGroup = new EventEmitter<void>();
  @Output() createGroup = new EventEmitter<string>();
  @Output() closeCreateGroup = new EventEmitter<void>();
  @Output() collapseSidebar = new EventEmitter<void>();

  get hasUnread(): boolean {
    return this.conversations.some((c) => c.unreadCount > 0);
  }

  isSelected(conv: ConversationItem): boolean {
    return conv.roomId === this.activeConvId;
  }

  onSearchChange(value: string): void {
    this.searchChange.emit(value);
  }

  onSearchKeydown(event: KeyboardEvent): void {
    this.searchKeydown.emit(event);
  }

  onSearchFocus(): void {
    this.searchFocus.emit();
  }

  onSearchBlur(): void {
    this.searchBlur.emit();
  }

  onSelectConversation(conv: ConversationItem): void {
    this.selectConversation.emit(conv);
  }

  onContextMenu(event: MouseEvent, conv: ConversationItem): void {
    this.conversationContextMenu.emit({ event, conv });
  }

  onFilterChange(type: FilterType): void {
    this.filterChange.emit(type);
  }

  onToggleUserDropdown(): void {
    this.toggleUserDropdown.emit();
  }

  onCloseUserDropdown(): void {
    this.closeUserDropdown.emit();
  }

  onToggleUserForAdd(userId: string): void {
    this.toggleUserForAdd.emit(userId);
  }

  onStartConversation(profile: Profile): void {
    this.router.navigate(["/chat"], { queryParams: { userId: profile.user_id } });
  }

  onOpenCreateGroup(): void {
    this.router.navigate(["/chat/create-group"]);
  }

  onCreateGroup(): void {
    if (this.newGroupName.trim()) {
      this.createGroup.emit(this.newGroupName.trim());
    }
  }

  onCloseCreateGroup(): void {
    this.closeCreateGroup.emit();
  }

  onCollapseSidebar(): void {
    this.collapseSidebar.emit();
  }
}
