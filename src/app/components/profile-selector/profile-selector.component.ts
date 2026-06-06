import { Component, Input, Output, EventEmitter, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatMenuModule } from "@angular/material/menu";
import { StorageService } from "@services/storage.service";
import { Profile } from "@models/generated/api.types";
import { UserAvatarComponent } from "@components/user-avatar/user-avatar.component";

export interface ProfileOption {
  id: string;
  user_id: string;
  name: string;
  last_name: string;
  email: string;
  image_url?: string;
}

@Component({
  selector: "app-profile-selector",
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatMenuModule, UserAvatarComponent],
  templateUrl: "./profile-selector.component.html",
})
export class ProfileSelectorComponent {
  private storageService = inject(StorageService);

  @Input() active = "";
  @Input() excludeCurrentUser = true;
  @Input() profiles: Profile[] | null = null;
  @Output() select = new EventEmitter<ProfileOption>();

  get allProfiles(): Profile[] {
    return this.profiles ?? this.storageService.allProfiles();
  }

  getActiveProfile(): Profile | undefined {
    return this.allProfiles.find((p) => p.id === this.active);
  }

  getFilteredProfiles(): Profile[] {
    const currentUserId = this.storageService.profile()?.user_id;
    let filtered = this.allProfiles;
    if (this.excludeCurrentUser && currentUserId) {
      filtered = filtered.filter((p) => p.user_id !== currentUserId);
    }
    return filtered;
  }

  onSelect(profile: Profile): void {
    this.select.emit({
      id: profile.id,
      user_id: profile.user_id,
      name: profile.name,
      last_name: profile.last_name,
      email: profile.user?.email || "",
      image_url: profile.image_url,
    });
  }

  getProfileInitials(profile: Profile): string {
    return `${profile.name[0] || ""}${profile.last_name[0] || ""}`.toUpperCase();
  }

  getProfileColor(profile: Profile): string {
    const colors = [
      "bg-red-500",
      "bg-blue-500",
      "bg-green-500",
      "bg-yellow-500",
      "bg-purple-500",
      "bg-pink-500",
      "bg-indigo-500",
      "bg-teal-500",
    ];
    const index = profile.name.charCodeAt(0) % colors.length;
    return colors[index];
  }
}
