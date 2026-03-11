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
import { Category } from "@models/category.model";

/* helpers */
import { RelationsHelper } from "@helpers/relations.helper";

/* services */
import { AuthService } from "@services/auth.service";
import { LocalWebSocketService } from "@services/local-websocket.service";
import { NotifyService } from "@services/notify.service";
import { ShortcutService } from "@services/shortcut.service";
import { StorageService } from "@services/storage.service";
import { DataSyncService } from "@services/data-sync.service";
import { WebSocketDispatcherService } from "@services/websocket-dispatcher.service";

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

  @ViewChild(ShortcutHelpComponent) shortcutHelp!: ShortcutHelpComponent;
  @ViewChild(HeaderComponent) headerComponent!: HeaderComponent;

  url = signal<string>("");
  showComponents = signal<boolean>(true);
  private isDataLoaded = false;

  private authRoutes = ["/login", "/signup", "/reset-password", "/change-password"];

  ngOnInit(): void {
    this.wsDispatcher.initWebSocketListeners();

    this.shortcutService.help$.subscribe(() => {
      this.shortcutHelp.show();
    });

    this.shortcutService.sync$.subscribe(() => {
      this.triggerSync();
    });

    this.localWs.getConnectionStatus().subscribe(() => {});

    const theme = localStorage.getItem("theme") ?? "";
    document.querySelector("html")!.setAttribute("class", theme);

    this.updateShowComponents();

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
      this.authService.checkToken<User>(token).subscribe({
        next: (user: User) => {
          this.loadAllData();

          this.triggerSync();

          this.checkUserProfile();
        },
        error: (err: Response<string>) => {
          this.notifyService.showError(err.message ?? err.toString());
          this.router.navigate(["/login"]);
        },
      });
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
      next: () => {},
      error: (error) => {
        this.notifyService.showError("Failed to load data. Please refresh the page.");
      },
    });

    // Load categories separately to ensure they're available
    this.dataSyncProvider.getAll<Category>("categories", { userId }).subscribe({
      next: (categories) => {
        this.storageService.setCategories(categories);
      },
      error: (error) => {
        console.error("Failed to load categories:", error);
      },
    });
  }

  async checkUserProfile() {
    const userId = this.authService.getValueByKey("id");
    if (userId && userId != "") {
      this.dataSyncProvider.get<Profile>("profiles", { userId }).subscribe({
        next: (profile) => {
          if (!profile || !profile.user || !profile.user.username) {
            this.router.navigate(["/create-profile"]);
          }
        },
      });
    }
  }

  /**
   * Trigger a manual synchronization
   */
  triggerSync(): void {
    this.headerComponent?.syncAll();
  }
}
