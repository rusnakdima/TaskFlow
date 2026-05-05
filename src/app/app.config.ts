/* sys lib */
import { ApplicationConfig, APP_INITIALIZER } from "@angular/core";
import { provideRouter } from "@angular/router";
import { provideHttpClient } from "@angular/common/http";
import { provideNativeDateAdapter } from "@angular/material/core";

/* app */
import { routes } from "@app/app.routes";
import { DataService } from "@services/data/data.service";
import { DataSyncService } from "@services/data/data-sync.service";

function initializeDataSync(dataSyncService: DataSyncService, dataService: DataService) {
  return () => dataSyncService.initTauriListeners(dataService);
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideNativeDateAdapter(),
    provideHttpClient(),
    DataService,
    DataSyncService,
    {
      provide: APP_INITIALIZER,
      useFactory: initializeDataSync,
      deps: [DataSyncService, DataService],
      multi: true,
    },
  ],
};
