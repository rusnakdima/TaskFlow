import { Component, OnInit, OnDestroy, signal, inject } from "@angular/core";
import { Router, NavigationEnd } from "@angular/router";
import { filter } from "rxjs/operators";
import { SchemaShellComponent } from "@tauri-front/shared";
import { StorageService } from "@services/storage.service";
import { AuthService } from "@services/auth/auth.service";
import { ShortcutService } from "@services/ui/shortcut.service";
import { AppStateService } from "@core/services/app-state.service";
import { MongoConnectionService } from "@core/services/mongo-connection.service";
import { ProfileRequiredService } from "@core/services/profile-required.service";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [SchemaShellComponent],
  templateUrl: "./app.html",
})
export class AppComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private authService = inject(AuthService);
  private shortcutService = inject(ShortcutService);
  private profileRequiredService = inject(ProfileRequiredService);
  private appStateService = inject(AppStateService);
  private mongoConnectionService = inject(MongoConnectionService);
  private storageService = inject(StorageService);
  url = signal<string>("");
  showComponents = signal<boolean>(true);
  showShell = signal<boolean>(true);
  showInfoBlock = this.appStateService.showInfoBlock;
  private authRoutes = [
    "/login",
    "/signup",
    "/reset-password",
    "/change-password",
    "/profile/manage",
  ];
  private connectionCheckInterval: ReturnType<typeof setInterval> | undefined;

  async ngOnInit(): Promise<void> {
    this.shortcutService.sync$.subscribe(() => {
      this.triggerSync();
    });
    this.updateShowComponents();
    this.authService.initializeSession(this.authRoutes);
    this.storageService.ensureUserLoaded();
    this.storageService.ensureProfileLoaded();
    this.mongoConnectionService.checkConnection().subscribe();
    this.connectionCheckInterval = setInterval(() => {
      this.mongoConnectionService.checkConnection().subscribe();
    }, 30000);
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe((_val) => {
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
    this.showShell.set(!isAuthPage && !this.profileRequiredService.profileRequiredMode());
  }

  triggerSync(): void {
    // Sync is handled via schema commands in SDUI mode
  }

  ngOnDestroy(): void {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
    }
  }
}
