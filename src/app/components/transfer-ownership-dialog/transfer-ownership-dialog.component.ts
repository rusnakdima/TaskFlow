import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatMenuModule } from "@angular/material/menu";
import { Profile } from "@entities/generated/api.types";
import { UserAvatarComponent } from "@components/user-avatar/user-avatar.component";
import { AppButtonComponent } from "@components/shared/button/button.component";
@Component({
  selector: "app-transfer-ownership-dialog",
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    UserAvatarComponent,
    AppButtonComponent,
  ],
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
  getSelectedProfile(): Profile | undefined {
    if (!this.selectedUserId) return undefined;
    return this.availableProfiles.find((p) => p.user_id === this.selectedUserId);
  }
  getProfileById(userId: string): Profile | undefined {
    return this.availableProfiles.find((p) => p.user_id === userId);
  }
  onUserSelected(profile: Profile): void {
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
