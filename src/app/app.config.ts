/* sys lib */
import { ApplicationConfig, provideAppInitializer, inject } from "@angular/core";
import { provideUnifiedApp } from "@tauri-front/shared";
import { provideRouter } from "@angular/router";
/* app */
import { routes } from "@app/app.routes";
import { UnifiedSyncService } from "@services/sync/unified-sync.service";

export const appConfig: ApplicationConfig = {
  providers: [
    ...provideUnifiedApp({
      enableAnimations: true,
      enableHttpClient: true,
      enableBrowserErrorListeners: true,
      enableZoneChangeDetection: true,
    }),
    provideRouter(routes),
    provideAppInitializer(() => {
      const sync = inject(UnifiedSyncService);
      sync.initTauriListeners();
    }),
  ],
};
