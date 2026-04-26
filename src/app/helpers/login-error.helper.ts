import { NetworkErrorHelper } from "./network-error.helper";

export class LoginErrorHelper {
  static handleAuthError(error: unknown, notifyService: any, hasLocalUsers: boolean = false): void {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (NetworkErrorHelper.isNetworkError(error)) {
      if (hasLocalUsers) {
        notifyService.showError("No internet connection. Using local database...");
      } else {
        notifyService.showError(
          "Cannot connect to database.\n\nPlease check:\n1. Your internet connection\n2. Backend server is running\n3. Database connection is configured\n\nYou must connect to the database at least once to login."
        );
      }
    } else if (errorMessage.includes("User data exists but no cached token")) {
      notifyService.showError(
        "User found locally but no cached token. Please login online to refresh your session."
      );
    } else {
      notifyService.showError(errorMessage);
    }
  }

  static handleWebAuthnError(
    error: unknown,
    notifyService: any,
    context: string = "authentication"
  ): void {
    const message = error instanceof Error ? error.message : "Operation failed";
    notifyService.showError(`${context} failed: ${message}`);
  }

  static handleQrError(error: unknown, notifyService: any, context: string = "QR login"): void {
    const message = error instanceof Error ? error.message : String(error);
    notifyService.showError(`${context} failed: ${message}`);
  }

  static handleBiometricError(
    error: unknown,
    notifyService: any,
    context: string = "Biometric authentication"
  ): void {
    const message = error instanceof Error ? error.message : String(error);
    notifyService.showError(`${context} failed: ${message}`);
  }
}
