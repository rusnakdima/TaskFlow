/* sys lib */
import { Component, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { NavigationEnd, Router, RouterOutlet } from "@angular/router";
import { filter } from "rxjs";

/* models */
import { Response, ResponseStatus } from "@models/response.model";
import { User } from "@models/user.model";

/* services */
import { AuthService } from "@services/auth.service";
import { MainService } from "@services/main.service";
import { NotifyService } from "@services/notify.service";
import { WebSocketService } from "@services/websocket.service";

/* components */
import { HeaderComponent } from "@components/header/header.component";
import { WindowNotifyComponent } from "@components/window-notify/window-notify.component";
import { BottomNavComponent } from "@components/bottom-nav/bottom-nav.component";

@Component({
  selector: "app-root",
  standalone: true,
  providers: [AuthService, MainService, WebSocketService],
  imports: [CommonModule, RouterOutlet, HeaderComponent, WindowNotifyComponent, BottomNavComponent],
  templateUrl: "./app.html",
})
export class App {
  constructor(
    private router: Router,
    private authService: AuthService,
    private mainService: MainService,
    private notifyService: NotifyService,
    private webSocketService: WebSocketService
  ) {}

  url = signal<string>("");

  ngOnInit(): void {
    const theme = localStorage.getItem("theme") ?? "";
    document.querySelector("html")!.setAttribute("class", theme);

    const token = localStorage.getItem("token") ?? "";
    if (!token) {
      setTimeout(() => {
        if (
          this.router.url.indexOf("/login") == -1 &&
          this.router.url.indexOf("/signup") == -1 &&
          this.router.url.indexOf("/reset-password") == -1 &&
          this.router.url.indexOf("/change-password") == -1
        ) {
          this.router.navigate(["/login"]);
        }
      }, 1000);
    }

    if (token) {
      this.authService
        .checkToken<User>(token)
        .then((response: Response<User>) => {
          if (response.status == ResponseStatus.SUCCESS) {
            this.checkUserProfile();
          } else {
            this.notifyService.showNotify(response.status, response.message);
          }
        })
        .catch((err: Response<string>) => {
          this.notifyService.showError(err.message ?? err.toString());
          this.router.navigate(["/login"]);
        });
    }

    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe((val) => {
      let lastIndex =
        this.router.url.lastIndexOf("?") > -1
          ? this.router.url.lastIndexOf("?")
          : this.router.url.length;
      this.url.set(this.router.url.slice(0, lastIndex));
    });
  }

  async checkUserProfile() {
    const userId = this.authService.getValueByKey("id");
    if (userId && userId != "") {
      await this.mainService
        .getByField<string>("profile", { userId })
        .then((response: Response<string>) => {
          if (response.status == ResponseStatus.SUCCESS) {
            if (this.router.url == "/profile/create-profile") {
              this.router.navigate([""]);
            }
          } else {
            this.router.navigate(["/profile/create-profile"]);
          }
        })
        .catch((err: Response<string>) => {
          this.notifyService.showError(err.message ?? err.toString());
          if (err.status === ResponseStatus.ERROR) {
            this.router.navigate(["/profile/create-profile"]);
          }
        });
    } else {
      this.router.navigate(["/login"]);
    }
  }

  get showComponents(): boolean {
    if (
      [
        "/login",
        "/signup",
        "/reset-password",
        "/change-password",
        "/profile/create-profile",
      ].includes(this.url())
    ) {
      return false;
    } else {
      return true;
    }
  }
}
