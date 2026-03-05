/* sys lib */
import { Injectable, ErrorHandler } from "@angular/core";
import { Observable, throwError } from "rxjs";
import { catchError } from "rxjs/operators";

/* services */
import { NotifyService } from "@services/notify.service";

/* constants */
import { ERROR_MESSAGES, getErrorMessage, getUserFriendlyError } from "../constants/error-messages";

/**
 * GlobalErrorHandler - Centralized error handling for the application
 * Implements Angular's ErrorHandler interface
 */
@Injectable({
  providedIn: "root",
})
export class GlobalErrorHandler implements ErrorHandler {
  constructor(private notifyService: NotifyService) {}

  handleError(error: any): void {
    // Log error to console (always)
    console.error("[GlobalErrorHandler]", error);

    // Get user-friendly error message
    const userMessage = getUserFriendlyError(error);

    // Show notification to user
    this.notifyService.showError(userMessage);

    // Optionally: Send to error tracking service
    // this.errorTrackingService.track(error);
  }
}

/**
 * ErrorInterceptorService - RxJS error handling utilities
 * Provides reusable error handling operators for observables
 */
@Injectable({
  providedIn: "root",
})
export class ErrorInterceptorService {
  constructor(
    private notifyService: NotifyService,
    private errorHandler: GlobalErrorHandler
  ) {}

  /**
   * Handle HTTP or observable errors
   * Shows user notification and logs error
   * @param defaultMessage - Default message if error is undefined
   * @param showError - Whether to show error notification (default: true)
   */
  handleError<T>(defaultMessage: string = ERROR_MESSAGES.SERVER_ERROR, showError: boolean = true) {
    return (error: any): Observable<T> => {
      // Log error
      console.error("[ErrorInterceptor]", error);

      // Get user-friendly message
      const userMessage = getErrorMessage(error, defaultMessage);

      // Show notification if enabled
      if (showError) {
        this.notifyService.showError(userMessage);
      }

      // Handle specific error types
      if (error?.status === 401) {
        // Unauthorized - redirect to login
        // this.router.navigate(['/login']);
      }

      if (error?.status === 403) {
        // Forbidden
        this.notifyService.showError(ERROR_MESSAGES.FORBIDDEN);
      }

      // Return observable with error
      return throwError(() => error);
    };
  }

  /**
   * Handle error silently (log only, no notification)
   */
  handleSilentError<T>() {
    return (error: any): Observable<T> => {
      console.error("[SilentError]", error);
      return throwError(() => error);
    };
  }

  /**
   * Handle error with custom callback
   */
  handleErrorWithCallback<T>(callback: (error: any) => void) {
    return (error: any): Observable<T> => {
      console.error("[ErrorInterceptor]", error);
      callback(error);
      return throwError(() => error);
    };
  }

  /**
   * Retry on error with max attempts
   */
  retryOnError<T>(maxAttempts: number = 3) {
    return (source: Observable<T>): Observable<T> => {
      return source.pipe(
        catchError((error, caught) => {
          let attempts = 0;
          if (attempts < maxAttempts) {
            attempts++;
            console.warn(`[RetryOnError] Attempt ${attempts}/${maxAttempts}`);
            return caught;
          }
          return throwError(() => error);
        })
      );
    };
  }
}

/**
 * Helper function to wrap observable with error handling
 * @param observable - The observable to wrap
 * @param errorHandler - ErrorInterceptorService instance
 * @param defaultMessage - Default error message
 */
export function withErrorHandling<T>(
  observable: Observable<T>,
  errorHandler: ErrorInterceptorService,
  defaultMessage?: string
): Observable<T> {
  return observable.pipe(catchError(errorHandler.handleError<T>(defaultMessage)));
}
