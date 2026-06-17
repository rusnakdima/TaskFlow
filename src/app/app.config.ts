/* sys lib */
import { ApplicationConfig, APP_INITIALIZER } from "@angular/core";
import { provideRouter } from "@angular/router";
import { provideHttpClient } from "@angular/common/http";
import { provideNativeDateAdapter } from "@angular/material/core";
import { provideAnimations } from "@angular/platform-browser/animations";

/* app */
import { routes } from "@app/app.routes";
import { UnifiedSyncService } from "@services/sync/unified-sync.service";
import { logger } from "@services/logger.service";

function initializeDataSync(dataSyncService: UnifiedSyncService) {
  return async () => {
    const timeoutMs = 10000;
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error("Tauri init timeout")), timeoutMs);
    });
    const initPromise = dataSyncService.initTauriListeners();
    return Promise.race([initPromise, timeoutPromise]).catch((err) => {
      logger.warn("Tauri listeners init skipped: " + err.message);
    });
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideAnimations(),
    provideNativeDateAdapter(),
    provideHttpClient(),
    {
      provide: APP_INITIALIZER,
      useFactory: initializeDataSync,
      deps: [UnifiedSyncService],
      multi: true,
    },
  ],
};
