import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ProfileSelectorComponent } from "@components/profile-selector/profile-selector.component";
import { Profile } from "@models/generated/api.types";

@Component({
  selector: "app-transfer-ownership-dialog",
  standalone: true,
  imports: [CommonModule, ProfileSelectorComponent],
  templateUrl: "./transfer-ownership-dialog.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransferOwnershipDialogComponent {
  @Input() show = false;
  @Input() currentOwnerId: string = "";
  @Input() availableProfiles: Profile[] = [];
  @Output() confirm = new EventEmitter<string>();
  @Output() cancel = new EventEmitter<void>();

  selectedUserId: string = "";

  onUserSelected(profile: { id: string; user_id: string }): void {
    this.selectedUserId = profile.user_id;
  }

  onConfirm(): void {
    if (this.selectedUserId) {
      this.confirm.emit(this.selectedUserId);
      this.selectedUserId = "";
    }
  }

  onCancel(): void {
    this.selectedUserId = "";
    this.cancel.emit();
  }
}
