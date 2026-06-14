import { bootstrapApplication } from "@angular/platform-browser";
import { appConfig } from "@app/app.config";
import { App } from "@app/app";
import { getLoggingService } from "@tauri-apps/logger";

bootstrapApplication(App, appConfig).catch((err) => {
  getLoggingService().error("Angular bootstrap failed", err);
});
