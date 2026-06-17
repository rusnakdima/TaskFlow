import { invoke } from "@tauri-apps/api/core";

export type LogLevel = "debug" | "warn" | "error" | "info";

export interface LogEntry {
  level: string;
  component: string;
  message: string;
  timestamp: string;
}

export const logger = {
  debug(message: string, component: string = "app"): void {
    console.debug(`[${component}]`, message);
    invoke("log_message", { level: "debug", component, message }).catch(console.error);
  },
  warn(message: string, component: string = "app"): void {
    console.warn(`[${component}]`, message);
    invoke("log_message", { level: "warn", component, message }).catch(console.error);
  },
  error(message: string, component: string = "app"): void {
    console.error(`[${component}]`, message);
    invoke("log_message", { level: "error", component, message }).catch(console.error);
  },
  info(message: string, component: string = "app"): void {
    console.info(`[${component}]`, message);
    invoke("log_message", { level: "info", component, message }).catch(console.error);
  },
};
