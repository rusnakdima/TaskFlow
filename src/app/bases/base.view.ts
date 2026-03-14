/* sys lib */
import { signal } from "@angular/core";

/* helpers */
import { NetworkErrorHelper } from "@helpers/network-error.helper";

/**
 * Base class for all view components.
 * Provides common loading and error handling functionality.
 */
export abstract class BaseView {
  protected loading = signal(false);
  protected error = signal<string | null>(null);

  /**
   * Handle async load operations with automatic loading state and error handling
   */
  protected async handleLoad<T>(operation: () => Promise<T>): Promise<T> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const result = await operation();
      return result;
    } catch (err: any) {
      this.handleError(err);
      throw err;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Handle errors by setting the error signal
   */
  protected handleError(err: any): void {
    const errorMessage = err?.message || err?.toString() || "An unexpected error occurred";
    this.error.set(errorMessage);
    console.error("[BaseView] Error:", errorMessage);
  }

  /**
   * Clear error state
   */
  protected clearError(): void {
    this.error.set(null);
  }

  /**
   * Check if error is a network error
   * @deprecated Use NetworkErrorHelper.isNetworkError() instead
   */
  protected isNetworkError(err: any): boolean {
    return NetworkErrorHelper.isNetworkError(err);
  }
}
