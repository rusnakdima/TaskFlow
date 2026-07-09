/* sys lib */
import { Component, OnInit, OnDestroy, signal, computed, inject } from "@angular/core";
import { Router, RouterModule, NavigationEnd } from "@angular/router";
import { filter } from "rxjs/operators";
/* models */
/* helpers */
/* services */
import { AuthService } from "@services/auth/auth.service";
import { ShortcutService } from "@services/ui/shortcut.service";
import { ProfileRequiredService } from "@core/services/profile-required.service";
import { AppStateService } from "@core/services/app-state.service";
import { MongoConnectionService } from "@core/services/mongo-connection.service";
import { StorageService } from "@services/storage.service";
import { SchemaLoaderService } from "@services/schema-loader.service";
import { SchemaRouterService, SchemaRouteViewerComponent, UiSchema } from "@tauri-front/shared";
import { invoke } from "@tauri-apps/api/core";
import { Response } from "@app/entities/response.model";
@Component({
  selector: "app-root",
  standalone: true,
  imports: [RouterModule, SchemaRouteViewerComponent],
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
  private schemaLoader = inject(SchemaLoaderService);
  private schemaRouter = inject(SchemaRouterService);
  url = signal<string>("");
  showComponents = signal<boolean>(true);
  showShell = computed(
    () => this.showComponents() && !this.profileRequiredService.profileRequiredMode()
  );
  showInfoBlock = this.appStateService.showInfoBlock;
  schemaLoaded = signal<boolean>(false);
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

    // Load schema and initialize SDUI router
    try {
      const schema = await this.loadSchema();
      if (schema) {
        this.schemaRouter.setSchema(schema as any);
        const initialRoute = this.getInitialRoute();
        this.schemaRouter.navigate(initialRoute);
        this.schemaLoaded.set(true);
      }
    } catch (e) {
      console.error("[App] Failed to load schema:", e);
    }
  }

  private async loadSchema(): Promise<UiSchema | null> {
    // Use canonical get_ui_schema (data-first, returns Option<UiSchema>)
    try {
      const response = await invoke<Response<UiSchema>>("get_ui_schema", { id: "taskflow" });
      if (response.data) {
        return response.data;
      }
      // Schema not found — fall back to TaskFlow-specific get_schema (creates default)
      return await this.schemaLoader.getSchema("taskflow");
    } catch (e) {
      console.warn("[App] get_ui_schema failed, trying get_schema:", e);
      return await this.schemaLoader.getSchema("taskflow");
    }
  }

  private getInitialRoute(): string {
    // Check if we're on an auth page
    const currentPath = this.router.url.split("?")[0];
    if (
      currentPath === "/login" ||
      currentPath === "/signup" ||
      currentPath === "/reset-password" ||
      currentPath === "/change-password" ||
      currentPath.startsWith("/qr-login")
    ) {
      return currentPath;
    }
    return "/dashboard";
  }

  private updateShowComponents(): void {
    const currentPath = this.router.url.split("?")[0];
    const isAuthPage = this.authRoutes.some((route) => currentPath.startsWith(route));
    this.showComponents.set(!isAuthPage);
  }
  /**
   * Trigger a manual synchronization
   */
  triggerSync(): void {
    // Sync is handled via schema commands in SDUI mode
  }
  ngOnDestroy(): void {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
    }
  }
}
