/**
 * Network Error Helper
 *
 * Centralized utility for detecting network-related errors.
 * Used across the application to handle offline scenarios consistently.
 */
export class NetworkErrorHelper {
  /**
   * Check if an error is network-related
   *
   * @param error - The error to check
   * @returns true if the error is network-related, false otherwise
   *
   * @example
   * ```typescript
   * try {
   *   await this.dataSyncProvider.get(...);
   * } catch (error) {
   *   if (NetworkErrorHelper.isNetworkError(error)) {
   *     this.notifyService.showWarning('Working offline - data sync paused');
   *   }
   * }
   * ```
   */
  static isNetworkError(error: any): boolean {
    const message = error?.message || error?.toString() || "";
    const lowerMessage = message.toLowerCase();

    return (
      lowerMessage.includes("networkerror") ||
      lowerMessage.includes("network") ||
      lowerMessage.includes("offline") ||
      lowerMessage.includes("failed to fetch") ||
      lowerMessage.includes("server selection timeout") ||
      lowerMessage.includes("connection refused") ||
      lowerMessage.includes("connection reset") ||
      lowerMessage.includes("network request failed") ||
      lowerMessage.includes("websocket") ||
      lowerMessage.includes("timeout")
    );
  }

  /**
   * Get a user-friendly message for network errors
   *
   * @param error - The error to get message for
   * @returns User-friendly error message
   */
  static getNetworkErrorMessage(error: any): string {
    if (this.isNetworkError(error)) {
      return "Unable to connect to server. Working offline - changes will sync when connection is restored.";
    }
    return error?.message || "An unexpected error occurred";
  }
}
