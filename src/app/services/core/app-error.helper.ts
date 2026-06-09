import { Subscriber } from "rxjs";
import { ApiError } from "@models/api.model";

export class AppErrorHelper {
  static extractErrorMessage(err: any): string {
    if (!err) return "Unknown error occurred";
    if (err instanceof Error) {
      if (err instanceof ApiError) return err.message;
      return err.message;
    }
    if (typeof err === "string") return err;
    if (err && typeof err === "object") {
      if ("message" in err) return String((err as any).message);
      if ("error" in err) return String((err as any).error);
      if ("msg" in err) return String((err as any).msg);
      const keys = Object.keys(err);
      if (keys.length === 1) return String(err[keys[0]]);
    }
    return "Unknown error occurred";
  }

  static handleApiError<T>(subscriber: Subscriber<T>): (err: any) => void {
    return (err: any) => {
      const message = AppErrorHelper.extractErrorMessage(err);
      subscriber.error(
        new ApiError(message, AppErrorHelper.isNetworkError(err) ? "network" : "server")
      );
    };
  }

  static isNetworkError(err: any): boolean {
    if (!err) return false;
    if (err instanceof TypeError) return true;
    if (err instanceof ApiError) return err.status === "network";
    if (typeof err === "object") {
      if ("code" in err) {
        const code = (err as any).code;
        if (
          code === "ECONNREFUSED" ||
          code === "ENOTFOUND" ||
          code === "ETIMEDOUT" ||
          code === "NETWORK_ERROR"
        ) {
          return true;
        }
      }
      if ("name" in err) {
        const name = (err as any).name;
        if (name === "NetworkError" || name === "AbortError") {
          return true;
        }
      }
    }
    const message = err?.message || err?.toString() || "";
    const lowerMessage = message.toLowerCase();
    const errorName = err?.name || "";
    if (
      lowerMessage.includes("networkerror") ||
      lowerMessage.includes("network") ||
      lowerMessage.includes("offline") ||
      lowerMessage.includes("failed to fetch") ||
      lowerMessage.includes("server selection timeout") ||
      lowerMessage.includes("connection refused") ||
      lowerMessage.includes("connection reset") ||
      lowerMessage.includes("network request failed") ||
      lowerMessage.includes("timeout") ||
      lowerMessage.includes("load failed") ||
      lowerMessage.includes("err_connection") ||
      lowerMessage.includes("enetunreach") ||
      lowerMessage.includes("enomem") ||
      errorName === "TimeoutError" ||
      errorName === "NetworkError"
    ) {
      return true;
    }
    return !navigator.onLine;
  }

  static isMongoConnectionError(error: any): boolean {
    const message = error?.message || error?.toString() || "";
    const lowerMessage = message.toLowerCase();

    return (
      lowerMessage.includes("mongodb") ||
      lowerMessage.includes("server selection timeout") ||
      lowerMessage.includes("connection refused") ||
      lowerMessage.includes("max pool size") ||
      lowerMessage.includes("mongo") ||
      lowerMessage.includes("topology") ||
      lowerMessage.includes("replicaset") ||
      lowerMessage.includes("mongos")
    );
  }

  static isAuthenticationError(error: any): boolean {
    const message = error?.message || error?.toString() || "";
    const lowerMessage = message.toLowerCase();

    return (
      lowerMessage.includes("invalid password") ||
      lowerMessage.includes("wrong password") ||
      lowerMessage.includes("authentication failed") ||
      lowerMessage.includes("unauthorized") ||
      lowerMessage.includes("invalid credentials") ||
      lowerMessage.includes("user not found") ||
      lowerMessage.includes("login failed") ||
      lowerMessage.includes("access denied")
    );
  }

  static getNetworkErrorMessage(error: any): string {
    if (this.isMongoConnectionError(error)) {
      return "Cannot connect to database. Please check your internet connection and backend server.";
    }

    if (this.isAuthenticationError(error)) {
      return error?.message || "Authentication failed. Please check your credentials.";
    }

    if (this.isNetworkError(error)) {
      return "Unable to connect to server. Working offline - changes will sync when connection is restored.";
    }

    return error?.message || "An unexpected error occurred";
  }

  static getTroubleshootingSteps(error: any): string[] {
    const steps: string[] = [];

    if (this.isMongoConnectionError(error)) {
      steps.push(
        "Check if MongoDB server is running",
        "Verify connection string in .env is correct",
        "Check network/firewall allows connection to MongoDB",
        "Ensure backend server is running and accessible"
      );
    } else if (this.isNetworkError(error)) {
      steps.push(
        "Check your internet connection",
        "Verify backend server is running",
        "Check if firewall is blocking the connection"
      );
    }

    return steps;
  }

  static formatErrorMessage(error: any): string {
    const baseMessage = this.getNetworkErrorMessage(error);
    const steps = this.getTroubleshootingSteps(error);

    if (steps.length === 0) {
      return baseMessage;
    }

    return baseMessage + "\n\nPlease check:\n" + steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
  }
}
