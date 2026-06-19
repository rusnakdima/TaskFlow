import { Injectable } from "@angular/core";
import { TauriApiService } from "@app/api/tauri-api.service";

export type LogLevel = "debug" | "warn" | "error" | "info";

export interface LogEntry {
  level: string;
  component: string;
  message: string;
  timestamp: string;
}

@Injectable({ providedIn: "root" })
export class LoggerService {
  constructor(private readonly tauriApi: TauriApiService) {}

  debug(message: string, component: string = "app"): void {
    console.debug(`[${component}]`, message);
    this.tauriApi.invoke("log_message", { level: "debug", component, message }).subscribe({ error: console.error });
  }

  warn(message: string, component: string = "app"): void {
    console.warn(`[${component}]`, message);
    this.tauriApi.invoke("log_message", { level: "warn", component, message }).subscribe({ error: console.error });
  }

  error(message: string, component: string = "app"): void {
    console.error(`[${component}]`, message);
    this.tauriApi.invoke("log_message", { level: "error", component, message }).subscribe({ error: console.error });
  }

  info(message: string, component: string = "app"): void {
    console.info(`[${component}]`, message);
    this.tauriApi.invoke("log_message", { level: "info", component, message }).subscribe({ error: console.error });
  }
}

let _loggerService: LoggerService | null = null;
let _tauriApiService: TauriApiService | null = null;

function getTauriApiService(): TauriApiService {
  if (!_tauriApiService) {
    _tauriApiService = new TauriApiService();
  }
  return _tauriApiService;
}

function getLoggerService(): LoggerService {
  if (!_loggerService) {
    _loggerService = new LoggerService(getTauriApiService());
  }
  return _loggerService;
}

export const logger = {
  debug(message: string, component: string = "app"): void {
    getLoggerService().debug(message, component);
  },
  warn(message: string, component: string = "app"): void {
    getLoggerService().warn(message, component);
  },
  error(message: string, component: string = "app"): void {
    getLoggerService().error(message, component);
  },
  info(message: string, component: string = "app"): void {
    getLoggerService().info(message, component);
  },
};
