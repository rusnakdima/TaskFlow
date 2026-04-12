/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnDestroy, inject, signal } from "@angular/core";
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { Router, RouterModule } from "@angular/router";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Response, ResponseStatus } from "@models/response.model";
import { LoginForm } from "@models/auth-forms.model";
import { CheckboxField, TypeField } from "@models/form-field.model";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { SecurityService, UserSecurityStatus } from "@services/auth/security.service";
import { NotifyService } from "@services/notifications/notify.service";
import { DataSyncProvider } from "@providers/data-sync.provider";
import { JwtTokenService } from "@services/auth/jwt-token.service";

/* stores */
import { AuthStore } from "@stores/auth.store";

/* helpers */
import { NetworkErrorHelper } from "@helpers/network-error.helper";

/* components */
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

@Component({
  selector: "app-login",
  standalone: true,
  providers: [AuthService, SecurityService],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    MatIconModule,
    CheckboxComponent,
  ],
  templateUrl: "./login.view.html",
})
export class LoginView implements OnDestroy {
  loginForm: FormGroup<any>;
  private authStore = inject(AuthStore);
  private jwtTokenService = inject(JwtTokenService);

  rememberField: CheckboxField = {
    name: "remember",
    label: "Remember me",
    type: TypeField.checkbox,
    isShow: () => true,
  };

  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  hasLocalUsers = signal(false);
  isShowPassword = signal(false);
  submitted = signal(false);

  // Alternative login options - loaded from user settings
  showPasskeyOption = signal(false);
  showBiometricOption = signal(false);
  showTotpInput = signal(false);
  passkeyQrCode = signal<SafeResourceUrl | null>(null);
  totpCode = signal("");
  selectedLoginMethod = signal<"password" | "passkey" | "biometric">("password");

  // Security features loaded from backend
  userSecurityStatus = signal<UserSecurityStatus | null>(null);

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    public securityService: SecurityService,
    private router: Router,
    private notifyService: NotifyService,
    private dataSyncProvider: DataSyncProvider,
    private sanitizer: DomSanitizer
  ) {
    this.loginForm = this.fb.group({
      username: ["", [Validators.required, Validators.pattern("[a-zA-Z0-9]*")]],
      password: ["", [Validators.required, Validators.minLength(6)]],
      remember: [false],
    });
  }

  ngOnInit() {
    this.keydownHandler = (e) => {
      if (e.key == "Enter") this.send();
    };
    document.addEventListener("keydown", this.keydownHandler);

    this.checkDatabaseConnection();

    // When username changes, check if they have passkey/biometric enabled
    this.loginForm.get("username")?.valueChanges.subscribe((username) => {
      if (username && username.length >= 3) {
        this.checkUserSecurityStatus(username);
      } else {
        this.userSecurityStatus.set(null);
        this.showPasskeyOption.set(false);
        this.showBiometricOption.set(false);
      }
    });
  }

  private async checkUserSecurityStatus(username: string): Promise<void> {
    const authMethod = this.securityService.getAuthMethodForPlatform();
    const isWebAuthN = await this.securityService.isWebAuthNSupported();

    this.securityService.getUserSecurityStatus(username).subscribe({
      next: (status) => {
        this.userSecurityStatus.set(status);

        if (authMethod === "totp-qr" || !isWebAuthN) {
          // Desktop Tauri or no WebAuthN: show TOTP QR option
          this.showPasskeyOption.set(false);
          this.showBiometricOption.set(false);
        } else {
          // Mobile/browser with WebAuthN
          this.showPasskeyOption.set(status.passkeyEnabled);
          this.showBiometricOption.set(
            status.biometricEnabled && this.securityService.hasPlatformBiometric()
          );
        }

        // Update auth store
        this.authStore.setSecurityFeatures(status);
      },
      error: () => {
        // If we can't check, default based on platform
        if (authMethod === "totp-qr" || !isWebAuthN) {
          this.showPasskeyOption.set(false);
          this.showBiometricOption.set(false);
        } else {
          this.showBiometricOption.set(this.securityService.hasPlatformBiometric());
        }
      },
    });
  }

  /**
   * Check database connection and local users
   */
  checkDatabaseConnection() {
    // First check if we can connect to the database
    this.dataSyncProvider.crud<any[]>("getAll", "users", {}, true).subscribe({
      next: (users) => {
        // Filter out deleted users (isDeleted: false means active)
        const activeUsers = (users || []).filter((u) => !u.isDeleted);
        this.hasLocalUsers.set(activeUsers.length > 0);
      },
      error: (err) => {
        console.error("Database connection error:", err);
        this.hasLocalUsers.set(false);

        // Show more helpful error message
        if (NetworkErrorHelper.isNetworkError(err)) {
          this.notifyService.showWarning(
            "Cannot connect to database. Please check:\n" +
              "1. MongoDB server is running\n" +
              "2. Connection string in .env is correct\n" +
              "3. Network/firewall allows connection\n\n" +
              "Check terminal for detailed error message."
          );
        }
      },
    });
  }

  ngOnDestroy() {
    if (this.keydownHandler) {
      document.removeEventListener("keydown", this.keydownHandler);
    }
  }

  get f() {
    return this.loginForm.controls;
  }

  isInvalid(attr: string) {
    return (this.submitted() || this.f[attr].touched || this.f[attr].dirty) && this.f[attr].errors;
  }

  async send() {
    this.submitted.set(true);

    if (this.loginForm.invalid) {
      Object.values(this.loginForm.controls).forEach((control: any) => {
        control.markAsTouched();
      });
      return;
    }

    if (this.loginForm.valid) {
      const authData: LoginForm = {
        username: this.f["username"].value,
        password: this.f["password"].value,
        remember: this.f["remember"].value,
      };

      try {
        const result = await this.authService.loginWithOfflineFirst(authData);
        const { token, requiresDataSync, isOffline } = result;

        if (!token) {
          this.notifyService.showError("No authentication token available");
          this.submitted.set(false);
          return;
        }

        // Store token
        if (this.f["remember"].value) {
          localStorage.setItem("token", token);
        } else {
          sessionStorage.setItem("token", token);
        }

        // Check if TOTP is required
        const status = this.userSecurityStatus();
        if (status?.totpEnabled) {
          this.showTotpInput.set(true);
          this.submitted.set(false);
          return;
        }

        if (isOffline) {
          this.notifyService.showWarning("Working offline - some features limited");
        } else {
          this.notifyService.showSuccess("Login successful");
        }

        this.router.navigate(["/dashboard"]).then(() => {
          this.submitted.set(false);
        });
      } catch (err: any) {
        console.error("Login error:", err);

        if (NetworkErrorHelper.isNetworkError(err)) {
          if (this.hasLocalUsers()) {
            this.notifyService.showError("No internet connection. Using local database...");
          } else {
            this.notifyService.showError(
              "Cannot connect to database.\n\nPlease check:\n1. Your internet connection\n2. Backend server is running\n3. Database connection is configured\n\nYou must connect to the database at least once to login."
            );
          }
        } else if (err.message?.includes("User data exists but no cached token")) {
          this.notifyService.showError(
            "User found locally but no cached token. Please login online to refresh your session."
          );
        } else {
          this.notifyService.showError(err.message ?? err.toString());
        }
        this.submitted.set(false);
      }
    } else {
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }

  async verifyTotpAndLogin(): Promise<void> {
    const code = this.totpCode();
    if (code.length !== 6) {
      this.notifyService.showError("Please enter a 6-digit TOTP code");
      return;
    }

    const username = this.f["username"].value;

    try {
      await new Promise((resolve, reject) => {
        this.securityService.completeTotpLogin(username, code).subscribe({
          next: (token) => {
            if (this.f["remember"].value) {
              localStorage.setItem("token", token);
            } else {
              sessionStorage.setItem("token", token);
            }
            this.notifyService.showSuccess("Login successful");
            this.router.navigate(["/dashboard"]);
            resolve(token);
          },
          error: (err) => reject(err),
        });
      });
    } catch (err: any) {
      this.notifyService.showError("Invalid TOTP code: " + (err.message || err));
    }
  }

  async loginWithPasskey(): Promise<void> {
    this.submitted.set(true);
    try {
      // Check if WebAuthN is actually supported (async check)
      const isWebAuthN = await this.securityService.isWebAuthNSupported();

      if (!isWebAuthN) {
        // Desktop Tauri or mobile without WebAuthN: Use TOTP QR code flow
        await this.initTotpQrLogin();
        return;
      }

      // Mobile/Browser with WebAuthN: Use WebAuthN passkey
      const result = await this.securityService.authenticateWithPasskey();

      if (result.success && result.username) {
        await this.completePasswordlessLogin(result.username, result.requiresTotp || false);
      } else {
        this.notifyService.showError(result.error || "Passkey authentication failed");
      }
    } catch (err: any) {
      console.error("Passkey login error:", err);
      // If WebAuthN error, fall back to TOTP QR
      if (
        err.message?.includes("does not support public key credentials") ||
        err.message?.includes("NotSupportedError") ||
        err.message?.includes("atob")
      ) {
        console.log("WebAuthN not supported, falling back to TOTP QR");
        await this.initTotpQrLogin();
      } else {
        this.notifyService.showError("Passkey authentication failed: " + (err.message || err));
      }
    } finally {
      this.submitted.set(false);
    }
  }

  /**
   * Initialize TOTP QR code login for desktop Tauri
   * Shows a QR code that user scans with Google Authenticator
   */
  async initTotpQrLogin(): Promise<void> {
    try {
      const username = this.f["username"].value;
      if (!username) {
        this.notifyService.showError("Please enter your username first");
        return;
      }

      // Get TOTP setup/init from backend
      // The QR code contains a TOTP URI for Google Authenticator
      const initResult = await new Promise<{ qrCode: string; secret?: string }>(
        (resolve, reject) => {
          this.securityService.initTotpForLogin(username).subscribe({
            next: (result) => resolve(result),
            error: reject,
          });
        }
      );

      // Display QR code
      this.passkeyQrCode.set(this.sanitizer.bypassSecurityTrustResourceUrl(initResult.qrCode));
      this.authStore.setPasskeyQrCode(initResult.qrCode, username);
      this.selectedLoginMethod.set("passkey");

      // Show instructions to user
      this.notifyService.showInfo("Scan the QR code with Google Authenticator app on your phone");
    } catch (err: any) {
      console.error("TOTP QR init error:", err);
      this.notifyService.showError("Failed to generate QR code: " + (err.message || err));
    }
  }

  async loginWithBiometric(): Promise<void> {
    this.submitted.set(true);
    try {
      // Check if WebAuthN is actually supported
      const isWebAuthN = await this.securityService.isWebAuthNSupported();

      if (!isWebAuthN) {
        this.notifyService.showError(
          "Biometric authentication is only available on mobile devices or browsers with WebAuthN support. Please use TOTP QR code login instead."
        );
        return;
      }

      const result = await this.securityService.authenticateWithBiometric();

      if (result.success) {
        await this.completePasswordlessLogin(
          result.username || this.f["username"].value,
          result.requiresTotp || false
        );
      } else {
        this.notifyService.showError(result.error || "Biometric authentication failed");
      }
    } catch (err: any) {
      console.error("Biometric login error:", err);
      this.notifyService.showError("Biometric authentication failed: " + (err.message || err));
    } finally {
      this.submitted.set(false);
    }
  }

  private async completePasswordlessLogin(username: string, requiresTotp: boolean): Promise<void> {
    if (requiresTotp) {
      // Show TOTP input
      this.showTotpInput.set(true);
      this.submitted.set(false);
      return;
    }

    // Get token via offline-first (will use local auth)
    const authData: LoginForm = {
      username,
      password: "", // Passwordless
      remember: this.f["remember"].value,
    };

    try {
      const loginResult = await this.authService.loginWithOfflineFirst(authData);

      if (loginResult.token) {
        if (this.f["remember"].value) {
          localStorage.setItem("token", loginResult.token);
        } else {
          sessionStorage.setItem("token", loginResult.token);
        }

        this.notifyService.showSuccess("Login successful");
        this.authStore.setAuthenticated(loginResult.token);
        this.router.navigate(["/dashboard"]);
      } else {
        this.notifyService.showError("Authentication failed - no token received");
      }
    } catch (err: any) {
      this.notifyService.showError("Login failed: " + (err.message || err));
    }
  }

  selectLoginMethod(method: "password" | "passkey" | "biometric"): void {
    this.selectedLoginMethod.set(method);
    this.authStore.setSelectedMethod(method);

    // Clear QR code when switching away from passkey
    if (method !== "passkey") {
      this.passkeyQrCode.set(null);
      this.authStore.clearPasskeyState();
    }

    // If switching to passkey, need username to check if they have it enabled
    if (method === "passkey" || method === "biometric") {
      const username = this.f["username"].value;
      if (username) {
        this.checkUserSecurityStatus(username);
      }
    }
  }
}
