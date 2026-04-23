/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, ViewChild, signal, computed, inject } from "@angular/core";
import { Router, RouterModule, NavigationEnd } from "@angular/router";
import { filter } from "rxjs/operators";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { User } from "@models/user.model";
import { Response } from "@models/response.model";
import { Profile } from "@models/profile.model";

/* helpers */
import { NetworkErrorHelper } from "@helpers/network-error.helper";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { WebSocketService } from "@services/core/websocket.service";
import { NotifyService } from "@services/notifications/notify.service";
import { ShortcutService } from "@services/ui/shortcut.service";
import { StorageService } from "@services/core/storage.service";
import { ProfileRequiredService } from "@services/core/profile-required.service";
import { DataLoaderService } from "@services/data/data-loader.service";
import { LocalAuthService } from "@services/auth/local-auth.service";
import { AppStateService } from "@services/core/app-state.service";

/* providers */
import { ApiProvider } from "@providers/api.provider";

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
  private profileRequiredService = inject(ProfileRequiredService);
  private dataSyncService = inject(DataLoaderService);
  private dataSyncProvider = inject(ApiProvider);
  private localAuthService = inject(LocalAuthService);
  private appStateService = inject(AppStateService);

  @ViewChild(ShortcutHelpComponent) shortcutHelp!: ShortcutHelpComponent;
  @ViewChild(HeaderComponent) headerComponent!: HeaderComponent;

  url = signal<string>("");
  showComponents = signal<boolean>(true);
  /** Show header and bottom nav only when not on auth page and not locked to create-profile */
  showShell = computed(
    () => this.showComponents() && !this.profileRequiredService.profileRequiredMode()
  );
  showInfoBlock = this.appStateService.showInfoBlock;
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

    // Data is now loaded via InitialDataResolver in routes
    // This ensures views don't render until data is available

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

  /**
   * Trigger a manual synchronization
   */
  triggerSync(silent: boolean = true): void {
    // Silent by default for background syncs
    this.headerComponent?.syncAll(silent);
  }
}
