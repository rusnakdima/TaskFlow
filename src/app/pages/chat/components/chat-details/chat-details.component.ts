import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { UserAvatarComponent } from "@components/user-avatar/user-avatar.component";
import { Profile } from "@entities/generated/api.types";

@Component({
  selector: "app-chat-details",
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, UserAvatarComponent],
  templateUrl: "./chat-details.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatDetailsComponent {
  @Input() showDetailsPanel = false;
  @Input() showDetailsMenu = false;
  @Input() members: any[] = [];
  @Input() showAddMembersDropdown = false;
  @Input() addMembersSearch = "";
  @Input() addMembersSearchResults: Profile[] = [];
  @Input() selectedAddMembers: string[] = [];
  @Input() isCurrentUserOwner = false;
  @Input() isGroup = false;
  @Input() isMobile = false;

  @Output() toggleDetailsPanel = new EventEmitter<void>();
  @Output() closeDetailsMenu = new EventEmitter<void>();
  @Output() openAddMembersDropdown = new EventEmitter<void>();
  @Output() closeAddMembersDropdown = new EventEmitter<void>();
  @Output() addMembersSearchChange = new EventEmitter<string>();
  @Output() toggleUserForAdd = new EventEmitter<string>();
  @Output() addMembersToGroup = new EventEmitter<void>();
  @Output() removeMember = new EventEmitter<string>();
  @Output() leaveGroup = new EventEmitter<void>();

  onToggleDetailsPanel(): void {
    this.toggleDetailsPanel.emit();
  }

  onCloseDetailsMenu(): void {
    this.closeDetailsMenu.emit();
  }

  onOpenAddMembersDropdown(): void {
    this.openAddMembersDropdown.emit();
  }

  onCloseAddMembersDropdown(): void {
    this.closeAddMembersDropdown.emit();
  }

  onAddMembersSearchChange(value: string): void {
    this.addMembersSearchChange.emit(value);
  }

  onToggleUserForAdd(userId: string): void {
    this.toggleUserForAdd.emit(userId);
  }

  onAddMembersToGroup(): void {
    this.addMembersToGroup.emit();
  }

  onRemoveMember(memberId: string): void {
    this.removeMember.emit(memberId);
  }

  onLeaveGroup(): void {
    this.leaveGroup.emit();
  }
}
