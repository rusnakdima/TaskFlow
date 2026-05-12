/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, OnDestroy, ViewChild, signal, computed, inject } from "@angular/core";
import { Router, RouterModule, NavigationEnd } from "@angular/router";
import { filter } from "rxjs/operators";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */

/* helpers */

/* services */
import { AuthService } from "@services/auth/auth.service";

import { ShortcutService } from "@services/ui/shortcut.service";

import { ProfileRequiredService } from "@services/core/profile-required.service";
import { AppStateService } from "@services/core/app-state.service";
import { MongoConnectionService } from "@services/core/mongo-connection.service";
import { StorageService } from "@services/storage.service";

/* components */
import { WindowNotifyComponent } from "@components/window-notify/window-notify.component";
import { ShortcutHelpComponent } from "@components/shortcut-help/shortcut-help.component";
import { HeaderComponent } from "@components/header/header.component";
import { FloatingBottomNavComponent } from "@components/floating-bottom-nav/floating-bottom-nav.component";
import { CommandPaletteComponent } from "@components/command-palette/command-palette.component";
import { BulkActionsComponent } from "@components/bulk-actions/bulk-actions.component";
import { ConfirmDialogComponent } from "@components/confirm-dialog/confirm-dialog.component";
import { PromptDialogComponent } from "@components/prompt-dialog/prompt-dialog.component";

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
    FloatingBottomNavComponent,
    CommandPaletteComponent,
    BulkActionsComponent,
    ConfirmDialogComponent,
    PromptDialogComponent,
  ],
  templateUrl: "./app.html",
})
export class App implements OnInit, OnDestroy {
  private router = inject(Router);
  private authService = inject(AuthService);

  private shortcutService = inject(ShortcutService);
  private profileRequiredService = inject(ProfileRequiredService);
  private appStateService = inject(AppStateService);
  private mongoConnectionService = inject(MongoConnectionService);
  private storageService = inject(StorageService);

  @ViewChild(ShortcutHelpComponent) shortcutHelp!: ShortcutHelpComponent;
  @ViewChild(HeaderComponent) headerComponent!: HeaderComponent;
  @ViewChild(CommandPaletteComponent) commandPalette!: CommandPaletteComponent;
  @ViewChild(FloatingBottomNavComponent) floatingBottomNav!: FloatingBottomNavComponent;

  url = signal<string>("");
  showComponents = signal<boolean>(true);
  showShell = computed(
    () => this.showComponents() && !this.profileRequiredService.profileRequiredMode()
  );
  showInfoBlock = this.appStateService.showInfoBlock;

  private authRoutes = ["/login", "/signup", "/reset-password", "/change-password"];
  private connectionCheckInterval: any;

  ngOnInit(): void {
    this.shortcutService.help$.subscribe(() => {
      this.shortcutHelp.show();
    });

    this.shortcutService.sync$.subscribe(() => {
      this.triggerSync();
    });

    this.shortcutService.focusSearch$.subscribe(() => {
      this.commandPalette?.open();
    });

    const theme = localStorage.getItem("theme") ?? "";
    document.querySelector("html")!.setAttribute("class", theme);

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
  }

  /**
   * Trigger a manual synchronization
   */
  triggerSync(silent: boolean = true): void {
    // Silent by default for background syncs
    this.headerComponent?.syncAll(silent);
  }

  ngOnDestroy(): void {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
    }
  }
}
