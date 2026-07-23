import {
  ApplicationConfig,
  provideAppInitializer,
  inject,
  provideZoneChangeDetection,
} from "@angular/core";
import { provideRouter } from "@angular/router";
import { routes } from "@app/app.routes";
import { UnifiedSyncService } from "@services/sync/unified-sync.service";

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAppInitializer(() => {
      const sync = inject(UnifiedSyncService);
      sync.initTauriListeners();
    }),
  ],
};
