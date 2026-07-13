/* angular */
import { ApplicationConfig, provideAppInitializer, inject } from "@angular/core";
import { provideRouter } from "@angular/router";

/* library */
import { provideUnifiedApp } from "@tauri-front/shared";

/* app:services */
import { UnifiedSyncService } from "@services/sync/unified-sync.service";

/* app:other */
import { routes } from "@app/app.routes";

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
