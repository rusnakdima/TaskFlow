import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { MatMenuModule } from "@angular/material/menu";
import { MatButtonModule } from "@angular/material/button";
import { Profile } from "@models/generated/api.types";
import { UserAvatarComponent } from "@components/user-avatar/user-avatar.component";
import { AppButtonComponent } from "@components/shared/button/button.component";

@Component({
  selector: "app-permissions-section",
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatMenuModule,
    MatButtonModule,
    UserAvatarComponent,
    AppButtonComponent,
  ],
  templateUrl: "./permissions-section.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PermissionsSectionComponent {
  @Input() assignees: Profile[] = [];
  @Input() selectedIds: Set<string> = new Set();
  @Input() roles: Record<string, string> = {};
  @Input() isOwner = false;
  @Output() rolesChange = new EventEmitter<{ profileId: string; role: string }>();
  @Output() transferOwnership = new EventEmitter<void>();

  getProfile(profileId: string): Profile | undefined {
    return this.assignees.find((p) => p.user_id === profileId);
  }

  onRoleChange(profileId: string, role: string): void {
    this.rolesChange.emit({ profileId, role });
  }

  getRoleIcon(role: string): string {
    const icons: Record<string, string> = {
      viewer: "visibility",
      editor: "edit",
      admin: "admin_panel_settings",
      moderator: "security",
    };
    return icons[role] || "visibility";
  }

  getRoleLabel(role: string): string {
    const labels: Record<string, string> = {
      viewer: "Viewer",
      editor: "Editor",
      admin: "Admin",
      moderator: "Moderator",
    };
    return labels[role] || "Viewer";
  }
}
