import { HttpErrorResponse } from "@angular/common/http";
import { Injectable, inject, signal, computed, DestroyRef } from "@angular/core";
import {
  TauriApiError,
  TauriApiErrorCode,
  AppError,
  isTauriApiError,
} from "@shared/models/error.model";

export interface ToastMessage {
  id: string;
  message: string;
  type: "error" | "warning" | "info" | "success";
  duration: number;
}

export { TauriApiErrorCode };

export interface ErrorResponse {
  error?: {
    code?: string;
    message?: string;
    details?: string;
  };
  message?: string;
  status?: number;
}

export interface RetryConfig {
  maxAttempts: number;
  delayMs: number;
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  delayMs: 1000,
  backoffMultiplier: 2,
};

export interface ErrorLogEntry {
  id: string;
  error: AppError;
  context?: string;
  timestamp: number;
}

function generateLogId(): string {
  return `log_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

@Injectable({
  providedIn: "root",
})
export class ErrorHandlerService {
  private destroyRef = inject(DestroyRef);
  private toastCounter = 0;

  private errorsSignal = signal<AppError[]>([]);
  private logsSignal = signal<ErrorLogEntry[]>([]);
  private isOnlineSignal = signal(navigator.onLine);
  private toastsSignal = signal<ToastMessage[]>([]);

  readonly errors = computed(() => this.errorsSignal());
  readonly logs = computed(() => this.logsSignal());
  readonly isOnline = computed(() => this.isOnlineSignal());
  readonly toasts = computed(() => this.toastsSignal());

  constructor() {
    const boundOnline = () => this.isOnlineSignal.set(true);
    const boundOffline = () => this.isOnlineSignal.set(false);
    window.addEventListener("online", boundOnline);
    window.addEventListener("offline", boundOffline);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener("online", boundOnline);
      window.removeEventListener("offline", boundOffline);
    });
  }

  handleError(error: unknown, context?: string): AppError {
    console.debug("[ERROR_HANDLER] handleError started", { context });
    const appError = this.normalizeError(error, context);
    this.logError(appError, context);

    if (this.shouldShowToast(appError)) {
      this.showToast(appError);
    }

    console.debug("[ERROR_HANDLER] handleError completed", {
      code: appError.code,
      retryable: appError.retryable,
    });
    return appError;
  }

  handleHttpError(error: HttpErrorResponse, context?: string): AppError {
    console.debug("[ERROR_HANDLER] handleHttpError started", {
      status: error.status,
      context,
    });
    const appError = this.convertHttpError(error);
    this.logError(appError, context);

    this.showToast(appError);

    console.debug("[ERROR_HANDLER] handleHttpError completed", { code: appError.code });
    return appError;
  }

  private shouldShowToast(error: AppError): boolean {
    if (error.code === TauriApiErrorCode.Timeout) return false;
    if (error.code === TauriApiErrorCode.ConnectionFailed) return true;
    if (isTauriApiError(error)) return false;
    return error.code !== "UNKNOWN";
  }

  private showToast(appError: AppError): void {
    const id = `toast_${++this.toastCounter}`;
    const message = appError.message;
    const type = this.getToastType(appError.code);

    const toast: ToastMessage = {
      id,
      message,
      type,
      duration: type === "error" ? 5000 : 3000,
    };

    this.toastsSignal.update((toasts) => [...toasts, toast]);

    setTimeout(() => {
      this.dismissToast(id);
    }, toast.duration);
  }

  private getToastType(code: string): ToastMessage["type"] {
    switch (code) {
      case TauriApiErrorCode.PermissionDenied:
        return "warning";
      case TauriApiErrorCode.NotFound:
        return "warning";
      default:
        return "error";
    }
  }

  dismissToast(id: string): void {
    this.toastsSignal.update((toasts) => toasts.filter((t) => t.id !== id));
  }

  clearToasts(): void {
    this.toastsSignal.set([]);
  }

  private normalizeError(error: unknown, context?: string): AppError {
    const timestamp = Date.now();

    if (isTauriApiError(error)) {
      return {
        code: error.code,
        message: error.message,
        context,
        timestamp,
        retryable:
          error.code === TauriApiErrorCode.Timeout ||
          error.code === TauriApiErrorCode.ConnectionFailed,
      };
    }

    if (error instanceof HttpErrorResponse) {
      return this.convertHttpError(error);
    }

    const message = error instanceof Error ? error.message : String(error);
    return {
      code: "UNKNOWN",
      message: `An unexpected error occurred: ${message}`,
      context,
      timestamp,
      retryable: false,
    };
  }

  private convertToAppError(error: unknown): AppError {
    if (error instanceof HttpErrorResponse) {
      return this.convertHttpError(error);
    }

    if (error instanceof Error) {
      return {
        code: "UNKNOWN",
        message: error.message,
        context: undefined,
        timestamp: Date.now(),
        retryable: true,
      };
    }

    return {
      code: "UNKNOWN",
      message: String(error),
      context: undefined,
      timestamp: Date.now(),
      retryable: true,
    };
  }

  private convertHttpError(error: HttpErrorResponse): AppError {
    if (!navigator.onLine) {
      return {
        code: TauriApiErrorCode.ConnectionFailed,
        message: "No internet connection",
        context: undefined,
        timestamp: Date.now(),
        retryable: true,
      };
    }

    switch (error.status) {
      case 0:
        return {
          code: TauriApiErrorCode.ConnectionFailed,
          message: error.message || "Network request failed",
          context: undefined,
          timestamp: Date.now(),
          retryable: true,
        };
      case 400:
        return this.parseErrorResponse(
          error,
          "VALIDATION_ERROR",
          "Invalid request. Please check your input."
        );
      case 401:
        return this.parseErrorResponse(
          error,
          "UNAUTHORIZED",
          "Authentication required. Please log in."
        );
      case 403:
        return this.parseErrorResponse(
          error,
          "FORBIDDEN",
          "You don't have permission to perform this action."
        );
      case 404:
        return this.parseErrorResponse(error, "NOT_FOUND", "The requested resource was not found.");
      case 408:
        return this.parseErrorResponse(error, "TIMEOUT", "Request timed out. Please try again.");
      case 500:
        return this.parseErrorResponse(
          error,
          "SERVER_ERROR",
          "Server error. Please try again later."
        );
      case 502:
      case 503:
      case 504:
        return this.parseErrorResponse(
          error,
          "SERVER_ERROR",
          "Service temporarily unavailable. Please try again later."
        );
      default:
        return this.parseErrorResponse(error, "UNKNOWN", "An error occurred. Please try again.");
    }
  }

  private parseErrorResponse(
    error: HttpErrorResponse,
    defaultCode: string,
    defaultMessage: string
  ): AppError {
    let userMessage = defaultMessage;
    let details: string | undefined;
    let code = defaultCode;

    if (error.error) {
      const errorResp = error.error as ErrorResponse;
      if (errorResp.error?.message) {
        userMessage = errorResp.error.message;
      } else if (errorResp.message) {
        userMessage = errorResp.message;
      }
      details = errorResp.error?.details;
    }

    return {
      code,
      message: error.message || defaultMessage,
      context: undefined,
      timestamp: Date.now(),
      retryable: code !== "FORBIDDEN" && code !== "UNAUTHORIZED",
    };
  }

  async retry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {},
    context?: string
  ): Promise<T> {
    console.debug("[ERROR_HANDLER] retry started", {
      maxAttempts: config.maxAttempts,
      context,
    });
    const { maxAttempts, delayMs, backoffMultiplier } = { ...DEFAULT_RETRY_CONFIG, ...config };

    let lastError: AppError | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await operation();
        console.debug("[ERROR_HANDLER] retry completed", { attempt });
        return result;
      } catch (error) {
        lastError = this.handleError(error, context);
        if (!lastError.retryable || attempt === maxAttempts) {
          console.error("[ERROR_HANDLER] retry failed", lastError, { attempt });
          throw lastError;
        }

        const delay = delayMs * Math.pow(backoffMultiplier, attempt - 1);
        await this.delay(delay);
      }
    }

    throw lastError;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private logError(error: AppError, context?: string): void {
    const entry: ErrorLogEntry = {
      id: generateLogId(),
      error,
      context,
      timestamp: Date.now(),
    };
    this.logsSignal.update((logs) => [entry, ...logs].slice(0, 100));
    this.errorsSignal.update((errors) => [error, ...errors].slice(0, 100));

    console.error("[ERROR_HANDLER] Error logged", error, { code: error.code, context });
  }
}
