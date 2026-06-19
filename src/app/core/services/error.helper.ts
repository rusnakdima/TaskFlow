import { Subscriber } from "rxjs";
import { ApiError } from "@entities/api.model";

export class ErrorHelper {
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
      const message = ErrorHelper.extractErrorMessage(err);
      subscriber.error(
        new ApiError(message, ErrorHelper.isNetworkError(err) ? "network" : "server")
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
        return (
          code === "ECONNREFUSED" ||
          code === "ENOTFOUND" ||
          code === "ETIMEDOUT" ||
          code === "NETWORK_ERROR"
        );
      }
      if ("name" in err) {
        const name = (err as any).name;
        return name === "NetworkError" || name === "AbortError";
      }
    }
    return !navigator.onLine;
  }
}
