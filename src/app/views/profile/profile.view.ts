/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal } from "@angular/core";
import { ActivatedRoute, RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Profile } from "@models/profile.model";

/* services */
import { AuthService } from "@services/auth.service";
import { NotifyService } from "@services/notify.service";
import { DataSyncProvider } from "@providers/data-sync.provider";

@Component({
  selector: "app-profile",
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: "./profile.view.html",
})
export class ProfileView implements OnInit {
  constructor(
    private route: ActivatedRoute,
    private authService: AuthService,
    private dataSyncProvider: DataSyncProvider,
    private notifyService: NotifyService
  ) {}

  userId: string = "";

  profile = signal<Profile | null>(null);

  ngOnInit(): void {
    this.userId = this.authService.getValueByKey("id");

    this.route.queryParams.subscribe((params: any) => {
      if (params.id && params.id != "") {
        this.getProfile(params.id);
      }
    });
  }

  getProfile(userId: string) {
    this.dataSyncProvider.get<Profile>("profiles", { userId }).subscribe({
      next: (profile) => {
        this.profile.set(profile);
      },
      error: (err) => {
        this.notifyService.showError(err.message || "Failed to load profile");
      },
    });
  }

  logout() {
    this.authService.logout();
  }
}
