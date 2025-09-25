/* sys lib */
import { ApplicationConfig } from "@angular/core";
import { provideRouter } from "@angular/router";
import { provideHttpClient } from "@angular/common/http";
import { provideNativeDateAdapter } from "@angular/material/core";

/* routes */
import { routes } from "./app.routes";

export const appConfig: ApplicationConfig = {
  providers: [provideRouter(routes), provideNativeDateAdapter(), provideHttpClient()],
};
