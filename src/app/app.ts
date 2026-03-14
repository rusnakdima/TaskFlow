/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, ViewChild, signal, inject } from "@angular/core";
import { Router, RouterModule, NavigationEnd } from "@angular/router";
import { filter } from "rxjs/operators";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { User } from "@models/user.model";
import { Response } from "@models/response.model";

/* helpers */
import { RelationsHelper } from "@helpers/relations.helper";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { LocalWebSocketService } from "@services/core/local-websocket.service";
import { NotifyService } from "@services/notifications/notify.service";
import { ShortcutService } from "@services/ui/shortcut.service";
import { StorageService } from "@services/core/storage.service";
import { DataSyncService } from "@services/data/data-sync.service";
import { WebSocketDispatcherService } from "@services/core/websocket-dispatcher.service";
import { LocalAuthService } from "@services/auth/local-auth.service";
import { JwtTokenService } from "@services/auth/jwt-token.service";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

/* components */
import { WindowNotifyComponent } from "@components/window-notify/window-notify.component";
import { ShortcutHelpComponent } from "@components/shortcut-help/shortcut-help.component";
import { HeaderComponent } from "@components/header/header.component";
import { BottomNavComponent } from "@components/bottom-nav/bottom-nav.component";
import { CommandPaletteComponent } from "@components/command-palette/command-palette.component";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    WindowNotifyComponent,
    ShortcutHelpComponent,
    HeaderComponent,
    BottomNavComponent,
    CommandPaletteComponent,
  ],
  templateUrl: "./app.html",
})
export class App implements OnInit {
  private router = inject(Router);
  private authService = inject(AuthService);
  private localWs = inject(LocalWebSocketService);
  private notifyService = inject(NotifyService);
  private shortcutService = inject(ShortcutService);
  private storageService = inject(StorageService);
  private dataSyncService = inject(DataSyncService);
  private wsDispatcher = inject(WebSocketDispatcherService);
  private dataSyncProvider = inject(DataSyncProvider);
  private localAuthService = inject(LocalAuthService);
  private jwtTokenService = inject(JwtTokenService);

  @ViewChild(ShortcutHelpComponent) shortcutHelp!: ShortcutHelpComponent;
  @ViewChild(HeaderComponent) headerComponent!: HeaderComponent;

  url = signal<string>("");
  showComponents = signal<boolean>(true);
  private isDataLoaded = false;
  private isOfflineMode = false;

  private authRoutes = ["/login", "/signup", "/reset-password", "/change-password"];

  ngOnInit(): void {
    this.wsDispatcher.initWebSocketListeners();

    this.shortcutService.help$.subscribe(() => {
      this.shortcutHelp.show();
    });

    this.shortcutService.sync$.subscribe(() => {
      this.triggerSync();
    });

    const theme = localStorage.getItem("theme") ?? "";
    document.querySelector("html")!.setAttribute("class", theme);

    this.updateShowComponents();

    const token = localStorage.getItem("token") || sessionStorage.getItem("token");

    if (!token) {
      // No token - check if we can authenticate offline
      setTimeout(() => {
        if (!this.authRoutes.some((route) => this.router.url.startsWith(route))) {
          // Check if offline auth is available
          if (this.authService.canAuthenticateOffline()) {
            this.notifyService.showInfo("Offline authentication available - please login");
          }
          this.router.navigate(["/login"]);
        }
      }, 1000);
    }

    if (token) {
      // First check if token is valid locally (without backend call)
      const isTokenExpired = this.jwtTokenService.isTokenExpired(token);

      if (!isTokenExpired) {
        // Token appears valid locally - try to load data
        // If backend is available, data will sync; if not, we use cached data
        this.loadAllData();
        this.checkTokenWithBackend(token); // Check in background
      } else {
        // Token expired - try offline auth with cached credentials
        const userId = this.jwtTokenService.getUserId(token);
        if (userId) {
          const localUser = this.localAuthService.getUserById(userId);
          if (localUser && localUser.availableForOffline && localUser.lastToken) {
            // We have offline credentials - user needs to re-enter password
            this.notifyService.showWarning("Session expired - please login again");
            this.router.navigate(["/login"]);
          } else {
            this.router.navigate(["/login"]);
          }
        } else {
          this.router.navigate(["/login"]);
        }
      }
    }

    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe((val) => {
      let lastIndex =
        this.router.url.lastIndexOf("?") > -1
          ? this.router.url.lastIndexOf("?")
          : this.router.url.length;
      this.url.set(this.router.url.slice(0, lastIndex));
      this.updateShowComponents();
    });
  }

  /**
   * Check token with backend in background (non-blocking)
   */
  private checkTokenWithBackend(token: string): void {
    this.authService.checkToken<User>(token).subscribe({
      next: (user: User) => {
        // Token is valid on backend - update local data if needed
        this.localAuthService.updateToken(user.id, token);
        this.loadAllData();
        this.triggerSync();
      },
      error: (err: Response<string>) => {
        // Backend check failed - could be offline
        // Check if it's a network error
        const isNetworkError =
          err.message?.includes("NetworkError") ||
          err.message?.includes("network") ||
          err.message?.includes("offline") ||
          err.message?.includes("Failed to fetch");

        if (isNetworkError) {
          // We're offline - use cached data
          this.isOfflineMode = true;
          this.notifyService.showWarning("Working offline - data sync paused");
        } else {
          // Token invalid - redirect to login
          this.notifyService.showError(err.message ?? err.toString());
          this.router.navigate(["/login"]);
        }
      },
    });
  }

  private updateShowComponents(): void {
    const currentPath = this.router.url.split("?")[0];
    const isAuthPage = this.authRoutes.some((route) => currentPath.startsWith(route));
    this.showComponents.set(!isAuthPage);
  }

  private loadAllData(): void {
    if (this.isDataLoaded) {
      return;
    }
    this.isDataLoaded = true;

    const userId = this.authService.getValueByKey("id") || "";
    const todoRelations = RelationsHelper.getTodoRelationsWithUser();

    this.dataSyncService.loadAllData(false).subscribe({
      next: () => {
        // Check profile after data is loaded
        this.checkUserProfile();
      },
      error: (error) => {
        this.notifyService.showError("Failed to load data. Please refresh the page.");
      },
    });

    // Categories are loaded by dataSyncService, no need to load separately
  }

  async checkUserProfile() {
    const userId = this.authService.getValueByKey("id");
    if (userId && userId != "") {
      // Fetch profile from backend with userId filter
      this.dataSyncProvider.getProfileByUserId(userId).subscribe({
        next: (profile) => {
          if (!profile || !profile.user || !profile.user.username) {
            this.router.navigate(["/profile/create-profile"]);
          }
        },
        error: (err) => {
          // Failed to load profile
          this.router.navigate(["/profile/create-profile"]);
        },
      });
    }
  }

  /**
   * Trigger a manual synchronization
   */
  triggerSync(silent: boolean = true): void {
    // Silent by default for background syncs
    this.headerComponent?.syncAll(silent);
  }
}
