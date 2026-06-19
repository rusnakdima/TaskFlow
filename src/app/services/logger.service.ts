export enum LogLevel {
  Debug = "debug",
  Info = "info",
  Warn = "warn",
  Error = "error",
}

export const logger = {
  debug: (...args: unknown[]) => console.debug("[TaskFlow]", ...args),
  info: (...args: unknown[]) => console.info("[TaskFlow]", ...args),
  warn: (...args: unknown[]) => console.warn("[TaskFlow]", ...args),
  error: (...args: unknown[]) => console.error("[TaskFlow]", ...args),
  log: (...args: unknown[]) => console.log("[TaskFlow]", ...args),
};
