import { bootstrapApplication } from "@angular/platform-browser";
import { AppComponent } from "@app/app";
import { appConfig } from "@app/app.config";

import "@tauri-front/shared";

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
