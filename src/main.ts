import "@tauri-front/shared";
import { loadStyleVariantNoop } from "@tauri-front/shared";
import { provideZoneChangeDetection } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { appConfig } from "@app/app.config";
import { App } from "@app/app";

loadStyleVariantNoop().then(() => {
  bootstrapApplication(App, {
    ...appConfig,
    providers: [provideZoneChangeDetection(), ...appConfig.providers],
  }).catch((_err) => {});
});
