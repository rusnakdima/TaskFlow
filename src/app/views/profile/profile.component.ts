/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { ActivatedRoute, RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Profile } from "@models/profile";
import { Response, ResponseStatus } from "@models/response";

/* services */
import { AuthService } from "@services/auth.service";
import { NotifyService } from "@services/notify.service";
import { ProfileService } from "@services/profile.service";

@Component({
  selector: "app-profile",
  standalone: true,
  providers: [AuthService, ProfileService, NotifyService],
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: "./profile.component.html",
})
export class ProfileComponent implements OnInit {
  constructor(
    private route: ActivatedRoute,
    private authService: AuthService,
    private profileService: ProfileService,
    private notifyService: NotifyService
  ) {}

  userId: string = "";
  queryId: string = "";

  profile: Profile | null = null;

  ngOnInit(): void {
    this.userId = this.authService.getValueByKey("id");

    this.route.queryParams.subscribe((params: any) => {
      if (params.id && params.id != "") {
        this.queryId = params.id;
        this.getProfile(this.queryId);
      }
    });
  }

  getProfile(userId: string) {
    this.profileService
      .get_by_user_id<Profile>(userId)
      .then((response: Response<Profile>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          this.profile = response.data;
        }
      })
      .catch((err: Response<string>) => {
        if (err.status === ResponseStatus.ERROR) {
          this.notifyService.showError(err.message ?? err.toString());
        }
      });
  }

  logout() {
    this.authService.logout();
  }
}
