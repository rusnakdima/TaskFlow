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
import { Profile } from "@models/profile.model";

/* helpers */
import { RelationsHelper } from "@helpers/relations.helper";
import { NetworkErrorHelper } from "@helpers/network-error.helper";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { WebSocketService } from "@services/core/websocket.service";
import { NotifyService } from "@services/notifications/notify.service";
import { ShortcutService } from "@services/ui/shortcut.service";
import { StorageService } from "@services/core/storage.service";
import { DataSyncService } from "@services/data/data-sync.service";
import { LocalAuthService } from "@services/auth/local-auth.service";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

/* components */
import { WindowNotifyComponent } from "@components/window-notify/window-notify.component";
import { ShortcutHelpComponent } from "@components/shortcut-help/shortcut-help.component";
import { HeaderComponent } from "@components/header/header.component";
import { BottomNavComponent } from "@components/bottom-nav/bottom-nav.component";
import { CommandPaletteComponent } from "@components/command-palette/command-palette.component";
import { BulkActionsComponent } from "@components/bulk-actions/bulk-actions.component";

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
    BulkActionsComponent,
  ],
  templateUrl: "./app.html",
})
export class App implements OnInit {
  private router = inject(Router);
  private authService = inject(AuthService);
  private ws = inject(WebSocketService);
  private notifyService = inject(NotifyService);
  private shortcutService = inject(ShortcutService);
  private storageService = inject(StorageService);
  private dataSyncService = inject(DataSyncService);
  private dataSyncProvider = inject(DataSyncProvider);
  private localAuthService = inject(LocalAuthService);

  @ViewChild(ShortcutHelpComponent) shortcutHelp!: ShortcutHelpComponent;
  @ViewChild(HeaderComponent) headerComponent!: HeaderComponent;

  url = signal<string>("");
  showComponents = signal<boolean>(true);
  private isDataLoaded = false;
  private isOfflineMode = false;

  private authRoutes = ["/login", "/signup", "/reset-password", "/change-password"];

  ngOnInit(): void {
    this.ws.initStorageListeners();

    this.shortcutService.help$.subscribe(() => {
      this.shortcutHelp.show();
    });

    this.shortcutService.sync$.subscribe(() => {
      this.triggerSync();
    });

    const theme = localStorage.getItem("theme") ?? "";
    document.querySelector("html")!.setAttribute("class", theme);

    this.updateShowComponents();

    // Initialize session from stored token
    this.authService.initializeSession(this.authRoutes);

    // Load all data immediately if user is authenticated
    // This ensures data is available even before token backend validation completes
    if (this.authService.isLoggedIn()) {
      this.loadAllData();
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
        // Data already loaded on init, just trigger sync
        this.triggerSync();
      },
      error: (err: Response<string>) => {
        // Backend check failed - could be offline
        // Check if it's a network error using centralized helper
        if (NetworkErrorHelper.isNetworkError(err)) {
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
      next: (data) => {
        // Load profile after main data is loaded
        this.loadUserProfile();
      },
      error: (error) => {
        // Error handled silently
      },
    });

    // Categories are loaded by dataSyncService, no need to load separately
  }

  private loadUserProfile(): void {
    const userId = this.authService.getValueByKey("id");
    if (!userId) {
      return;
    }

    this.dataSyncService.loadProfile().subscribe({
      next: (profile) => {
        this.checkUserProfile(profile);
      },
      error: (error) => {
        // Check if offline - if so, use cached profile
        if (this.storageService.profile()) {
          this.checkUserProfile(this.storageService.profile());
        }
      },
    });
  }

  private checkUserProfile(profile: Profile | null): void {
    if (!profile || !profile.user || !profile.user.username) {
      this.router.navigate(["/profile/create-profile"]);
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
