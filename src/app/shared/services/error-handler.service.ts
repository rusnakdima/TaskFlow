import { inject } from "@angular/core";
import { NotifyService } from "@services/notifications/notify.service";
import { Observable, Subscriber } from "rxjs";

export type ErrorHandlerFn = (err: unknown) => void;

export interface ErrorHandlerOptions {
  notifyOnError?: boolean;
  errorMessage?: string;
  context?: string;
}

export class ErrorHandlerService {
  private notifyService = inject(NotifyService);

  private extractMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === "object" && err !== null) {
      const msg = (err as any).message;
      if (typeof msg === "string" && msg.length > 0) return msg;
      return JSON.stringify(err);
    }
    return String(err);
  }

  handleError(err: unknown, context?: string): void {
    const message = this.extractMessage(err);
    const prefix = context ? `${context}: ` : "";
    this.notifyService.showError(prefix + message);
  }

  subscribeError<T>(observer: Subscriber<T>, errorMessage?: string): (err: unknown) => void {
    return (err: unknown) => {
      this.notifyService.showError(errorMessage || this.extractMessage(err));
      observer.error(err);
    };
  }

  wrapObservable<T>(observable: Observable<T>, errorMessage?: string): Observable<T> {
    return new Observable<T>((observer) => {
      return observable.subscribe({
        next: (value) => observer.next(value),
        error: this.subscribeError(observer, errorMessage),
        complete: () => observer.complete(),
      });
    });
  }

  withErrorHandling<T extends unknown[], R>(fn: (...args: T) => R, context?: string): (...args: T) => R {
    return (...args: T): R => {
      try {
        return fn(...args);
      } catch (err) {
        this.handleError(err, context);
        throw err;
      }
    };
  }

  createErrorHandler(options: ErrorHandlerOptions = {}): ErrorHandlerFn {
    return (err: unknown) => {
      const message = this.extractMessage(err);
      if (options.notifyOnError !== false) {
        const prefix = options.context ? `${options.context}: ` : "";
        this.notifyService.showError(prefix + (options.errorMessage || message));
      }
    };
  }
}

export function injectErrorHandler(): ErrorHandlerService {
  return new ErrorHandlerService();
}
