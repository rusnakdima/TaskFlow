/* sys lib */
import { ApplicationConfig, APP_INITIALIZER } from "@angular/core";
import { provideRouter } from "@angular/router";
import { provideHttpClient } from "@angular/common/http";
import { provideNativeDateAdapter } from "@angular/material/core";

/* app */
import { routes } from "@app/app.routes";
import { DataSyncService } from "@services/data/data-sync.service";

function initializeDataSync(dataSyncService: DataSyncService) {
  return () => dataSyncService.initTauriListeners();
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideNativeDateAdapter(),
    provideHttpClient(),
    DataSyncService,
    {
      provide: APP_INITIALIZER,
      useFactory: initializeDataSync,
      deps: [DataSyncService],
      multi: true,
    },
  ],
};
