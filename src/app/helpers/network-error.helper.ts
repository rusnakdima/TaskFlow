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
    const errorName = error?.name || "";

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
      lowerMessage.includes("timeout") ||
      lowerMessage.includes("load failed") ||
      lowerMessage.includes("err_connection") ||
      lowerMessage.includes("enetunreach") ||
      lowerMessage.includes("enomem") ||
      errorName === "TimeoutError" ||
      errorName === "NetworkError"
    );
  }

  /**
   * Check if error indicates MongoDB connection failure
   * More specific than isNetworkError - focuses on database connectivity
   *
   * @param error - The error to check
   * @returns true if the error is a MongoDB connection error
   */
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

  /**
   * Check if error indicates authentication failure (wrong credentials)
   *
   * @param error - The error to check
   * @returns true if the error is an authentication error
   */
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

  /**
   * Get a user-friendly message for network errors
   *
   * @param error - The error to get message for
   * @returns User-friendly error message
   */
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

  /**
   * Get detailed troubleshooting steps for connection errors
   *
   * @param error - The error to get steps for
   * @returns Array of troubleshooting steps
   */
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

  /**
   * Format a complete error message with troubleshooting steps
   *
   * @param error - The error to format
   * @returns Formatted error message with steps
   */
  static formatErrorMessage(error: any): string {
    const baseMessage = this.getNetworkErrorMessage(error);
    const steps = this.getTroubleshootingSteps(error);

    if (steps.length === 0) {
      return baseMessage;
    }

    return baseMessage + "\n\nPlease check:\n" + steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
  }
}

// Standalone function exports for convenience
export function isNetworkError(error: unknown): boolean {
  return NetworkErrorHelper.isNetworkError(error);
}

export function isMongoConnectionError(error: unknown): boolean {
  return NetworkErrorHelper.isMongoConnectionError(error);
}

export function isAuthenticationError(error: unknown): boolean {
  return NetworkErrorHelper.isAuthenticationError(error);
}

export function getNetworkErrorMessage(error: unknown): string {
  return NetworkErrorHelper.getNetworkErrorMessage(error);
}
