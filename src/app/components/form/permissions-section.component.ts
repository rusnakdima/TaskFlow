import {
  Component,
  Input,
  ChangeDetectionStrategy,
  forwardRef,
  signal,
  Output,
  EventEmitter,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { MatMenuModule } from "@angular/material/menu";
import { MatButtonModule } from "@angular/material/button";
import { Profile } from "@entities/generated/api.types";
import { UserAvatarComponent } from "@components/user-avatar/user-avatar.component";
import { AppButtonComponent } from "@components/shared/button/button.component";
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";

export interface PermissionsSectionValue {
  roles: Record<string, string>;
}

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
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => PermissionsSectionComponent),
      multi: true,
    },
  ],
})
export class PermissionsSectionComponent implements ControlValueAccessor {
  @Input() assignees: Profile[] = [];
  @Input() isOwner = false;

  @Input()
  get selectedIds(): Set<string> {
    return this._selectedIds();
  }
  set selectedIds(value: Set<string>) {
    this._selectedIds.set(value);
  }

  @Input()
  get roles(): Record<string, string> {
    return this._roles();
  }
  set roles(value: Record<string, string>) {
    this._roles.set(value);
  }

  @Output() rolesChange = new EventEmitter<{ profileId: string; role: string }>();
  @Output() transferOwnership = new EventEmitter<void>();

  private _selectedIds = signal<Set<string>>(new Set());
  private _roles = signal<Record<string, string>>({});

  private onChange: (value: PermissionsSectionValue) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(obj: PermissionsSectionValue): void {
    if (obj && obj.roles) {
      this._roles.set(obj.roles);
    }
  }

  registerOnChange(fn: (value: PermissionsSectionValue) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  getProfile(profileId: string): Profile | undefined {
    return this.assignees.find((p) => p.user_id === profileId);
  }

  onRoleChange(profileId: string, role: string): void {
    this._roles.update((currentRoles) => ({
      ...currentRoles,
      [profileId]: role,
    }));
    this.rolesChange.emit({ profileId, role });
    this.onChange({ roles: this._roles() });
    this.onTouched();
  }

  onTransferOwnership(): void {
    this.transferOwnership.emit();
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

  getRoles(): Record<string, string> {
    return this._roles();
  }
}
