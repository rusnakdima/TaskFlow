/* sys lib */
import { ApplicationConfig, APP_INITIALIZER } from "@angular/core";
import { provideRouter } from "@angular/router";
import { provideHttpClient } from "@angular/common/http";
import { provideNativeDateAdapter } from "@angular/material/core";

/* app */
import { routes } from "@app/app.routes";
import { UnifiedSyncService } from "@services/sync/unified-sync.service";

function initializeDataSync(dataSyncService: UnifiedSyncService) {
  return () => dataSyncService.initTauriListeners();
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideNativeDateAdapter(),
    provideHttpClient(),
    UnifiedSyncService,
    {
      provide: APP_INITIALIZER,
      useFactory: initializeDataSync,
      deps: [UnifiedSyncService],
      multi: true,
    },
  ],
};
