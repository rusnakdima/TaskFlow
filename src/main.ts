import { provideZoneChangeDetection } from "@angular/core";
import "@tauri-front/shared";
import { bootstrapApplication } from "@angular/platform-browser";
import { appConfig } from "@app/app.config";
import { App } from "@app/app";
bootstrapApplication(App, {
  ...appConfig,
  providers: [provideZoneChangeDetection(), ...appConfig.providers],
}).catch((_err) => {});
