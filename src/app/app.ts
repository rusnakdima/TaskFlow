/* sys lib */
import { Component, signal, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { NavigationEnd, Router, RouterOutlet } from "@angular/router";
import { filter } from "rxjs";

/* models */
import { Response, ResponseStatus } from "@models/response.model";
import { User } from "@models/user.model";
import { Profile } from "@models/profile.model";

/* services */
import { AuthService } from "@services/auth.service";
import { NotifyService } from "@services/notify.service";
import { LocalWebSocketService } from "@services/local-websocket.service";
import { ShortcutService } from "@services/shortcut.service";
import { SyncService } from "@services/sync.service";
import { StorageService } from "@services/storage.service";
import { DataSyncProvider } from "@providers/data-sync.provider";

/* components */
import { HeaderComponent } from "@components/header/header.component";
import { WindowNotifyComponent } from "@components/window-notify/window-notify.component";
import { BottomNavComponent } from "@components/bottom-nav/bottom-nav.component";
import { ShortcutHelpComponent } from "@components/shortcut-help/shortcut-help.component";
import { CommandPaletteComponent } from "@components/command-palette/command-palette.component";

@Component({
  selector: "app-root",
  standalone: true,
  providers: [AuthService, LocalWebSocketService, ShortcutService],
  imports: [
    CommonModule,
    RouterOutlet,
    HeaderComponent,
    WindowNotifyComponent,
    BottomNavComponent,
    ShortcutHelpComponent,
    CommandPaletteComponent,
  ],
  templateUrl: "./app.html",
})
export class App {
  constructor(
    private router: Router,
    private authService: AuthService,
    private notifyService: NotifyService,
    private localWs: LocalWebSocketService,
    private shortcutService: ShortcutService,
    private syncService: SyncService,
    private storageService: StorageService,
    private dataSyncProvider: DataSyncProvider
  ) {}

  @ViewChild(ShortcutHelpComponent) shortcutHelp!: ShortcutHelpComponent;

  url = signal<string>("");
  private isDataLoaded = false;

  ngOnInit(): void {
    this.shortcutService.help$.subscribe(() => {
      this.shortcutHelp.show();
    });

    this.shortcutService.sync$.subscribe(() => {
      this.triggerSync();
    });

    this.localWs.getConnectionStatus().subscribe(() => {
      // WebSocket connection status changed
    });

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
            // Set current user for WebSocket connection
            const userId = this.authService.getValueByKey("id");
            if (userId) {
              // this.localWs.setCurrentUser(userId);
            }
            // Initialize storage service with user context
            this.storageService.init();
            // Load all data once on app initialization
            this.loadAllData();
            // Trigger automatic sync on app open
            this.triggerSync();
            // Check user profile after data is loaded
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

  /**
   * Load all application data once on initialization
   * Data is cached in StorageService and reused across all views
   */
  private loadAllData(): void {
    if (this.isDataLoaded) {
      return; // Prevent duplicate loading
    }
    this.isDataLoaded = true;

    this.storageService.loadAllData(false).subscribe({
      next: () => {
        // Data loaded successfully
      },
      error: (error) => {
        console.error("App: Failed to load data", error);
        this.notifyService.showError("Failed to load data. Please refresh the page.");
      },
    });
  }

  async checkUserProfile() {
    const userId = this.authService.getValueByKey("id");
    if (userId && userId != "") {
      this.dataSyncProvider.get<Profile>("profiles", { userId }).subscribe({
        next: () => {
          // Profile exists - if on create-profile page, navigate away
          if (this.router.url.indexOf("/profile/create-profile") > -1) {
            this.router.navigate(["/dashboard"]);
          }
        },
        error: (err) => {
          // Profile doesn't exist - redirect to create profile
          // But don't redirect if already on create-profile page
          if (this.router.url.indexOf("/profile/create-profile") === -1) {
            this.router.navigate(["/profile/create-profile"]);
          }
        },
      });
    } else {
      this.router.navigate(["/login"]);
    }
  }

  async triggerSync() {
    this.notifyService.showInfo("Starting synchronization...");
    try {
      const response = await this.syncService.syncAll();
      if (response.status === ResponseStatus.SUCCESS) {
        this.notifyService.showSuccess("Synchronization completed successfully!");
      } else {
        this.notifyService.showError(response.message || "Synchronization failed");
      }
    } catch (error) {
      this.notifyService.showError("Synchronization failed: " + error);
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
