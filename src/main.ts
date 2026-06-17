import { bootstrapApplication } from "@angular/platform-browser";
import { appConfig } from "@app/app.config";
import { App } from "@app/app";
import { logger } from "@services/logger.service";

bootstrapApplication(App, appConfig).catch((err) => {
  logger.error("Angular bootstrap failed", err);
});
