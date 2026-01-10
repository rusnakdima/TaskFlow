/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal } from "@angular/core";
import { ActivatedRoute, RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Profile } from "@models/profile.model";
import { Response, ResponseStatus } from "@models/response.model";

/* services */
import { AuthService } from "@services/auth.service";
import { NotifyService } from "@services/notify.service";
import { MainService } from "@services/main.service";

@Component({
  selector: "app-profile",
  standalone: true,
  providers: [AuthService, MainService],
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: "./profile.view.html",
})
export class ProfileView implements OnInit {
  constructor(
    private route: ActivatedRoute,
    private authService: AuthService,
    private mainService: MainService,
    private notifyService: NotifyService
  ) {}

  userId: string = "";
  queryId: string = "";

  profile = signal<Profile | null>(null);

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
    this.mainService
      .getByField<Profile>("profile", "userId", userId)
      .then((response: Response<Profile>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          this.profile.set(response.data);
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
