import {
  Component,
  OnDestroy,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { Router, RouterModule } from "@angular/router";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";
import { firstValueFrom } from "rxjs";

import { MatIconModule } from "@angular/material/icon";

import { Response, ResponseStatus } from "@models/response.model";
import { LoginForm } from "@models/auth-forms.model";
import { CheckboxField, TypeField } from "@models/form-field.model";

import { AuthService } from "@services/auth/auth.service";
import { SecurityService, UserSecurityStatus } from "@services/auth/security.service";
import { NotifyService } from "@services/notifications/notify.service";
import { ApiProvider } from "@providers/api.provider";
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { AuthCapabilityService } from "@services/auth/auth-capability.service";
import { WebAuthnService } from "@services/auth/webauthn.service";
import { QrLoginService } from "@services/auth/qr-login.service";

import { AuthStore } from "@stores/auth.store";

import { NetworkErrorHelper } from "@helpers/network-error.helper";
import { BufferHelper } from "@helpers/buffer.helper";

import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

@Component({
  selector: "app-login",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [AuthService, SecurityService, AuthCapabilityService, WebAuthnService, QrLoginService],
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
  private authCapabilityService = inject(AuthCapabilityService);
  private webAuthnService = inject(WebAuthnService);
  private qrLoginService = inject(QrLoginService);

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

  showTotpInput = signal(false);
  totpCode = signal("");
  passkeyQrCode = signal<SafeResourceUrl | null>(null);

  userSecurityStatus = signal<UserSecurityStatus | null>(null);

  readonly capabilities = this.authCapabilityService.capabilities;

  readonly showPasskeyButton = computed(() => {
    const caps = this.capabilities();
    const status = this.userSecurityStatus();
    return caps.passkeyAvailable && status?.passkeyEnabled;
  });

  readonly showBiometricButton = computed(() => {
    const caps = this.capabilities();
    const status = this.userSecurityStatus();
    return caps.biometricAvailable && status?.biometricEnabled;
  });

  readonly showQrLoginButton = computed(() => {
    const caps = this.capabilities();
    // Always show QR login on desktop if available (don't require user status check)
    return caps.qrLoginAvailable;
  });

  readonly hasAlternativeLoginMethods = computed(() => {
    return this.showPasskeyButton() || this.showBiometricButton() || this.showQrLoginButton();
  });

  readonly platformName = computed(() => this.capabilities().platformName);

  readonly isQrLoginActive = signal(false);
  readonly qrLoginStatus = this.qrLoginService.qrStatus;
  readonly isQrLoginPolling = this.qrLoginService.isPolling;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    public securityService: SecurityService,
    private router: Router,
    private notifyService: NotifyService,
    private dataSyncProvider: ApiProvider,
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

    this.loginForm.get("username")?.valueChanges.subscribe((username) => {
      if (username && username.length >= 3) {
        this.checkUserSecurityStatus(username);
      } else {
        this.userSecurityStatus.set(null);
      }
    });
  }

  private async checkUserSecurityStatus(username: string): Promise<void> {
    this.securityService.getUserSecurityStatus(username).subscribe({
      next: (status) => {
        this.userSecurityStatus.set(status);
        this.authStore.setSecurityFeatures(status);
      },
      error: () => {
        this.userSecurityStatus.set(null);
      },
    });
  }

  checkDatabaseConnection() {
    this.dataSyncProvider.crud<any[]>("getAll", "users", {}, true).subscribe({
      next: (users) => {
        const activeUsers = (users || []).filter((u) => !u.deleted_at);
        this.hasLocalUsers.set(activeUsers.length > 0);
      },
      error: (err) => {
        this.hasLocalUsers.set(false);

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
    this.qrLoginService.clearQrData();
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
      this.submitted.set(false);
      return;
    }

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

      if (this.f["remember"].value) {
        localStorage.setItem("token", token);
      } else {
        sessionStorage.setItem("token", token);
      }

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
  }

  async verifyTotpAndLogin(): Promise<void> {
    const code = this.totpCode();
    if (code.length !== 6) {
      this.notifyService.showError("Please enter a 6-digit TOTP code");
      return;
    }

    const username = this.f["username"].value;

    try {
      await new Promise<void>((resolve, reject) => {
        this.securityService.completeTotpLogin(username, code).subscribe({
          next: (token) => {
            if (this.f["remember"].value) {
              localStorage.setItem("token", token);
            } else {
              sessionStorage.setItem("token", token);
            }
            this.notifyService.showSuccess("Login successful");
            this.router.navigate(["/dashboard"]);
            resolve();
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
    this.isQrLoginActive.set(false);

    try {
      const isWebAuthN = await this.webAuthnService.isWebAuthnSupported();

      if (!isWebAuthN) {
        this.notifyService.showError(
          "Passkey authentication is not supported on this device. Please use password login."
        );
        this.submitted.set(false);
        return;
      }

      const username = this.f["username"].value;
      if (!username) {
        this.notifyService.showError("Please enter your username first");
        this.submitted.set(false);
        return;
      }

      this.webAuthnService.initPasskeyAuthentication(username).subscribe({
        next: async (authOptions) => {
          try {
            const credential = await this.webAuthnService.getAssertion(authOptions.options);
            if (!credential) {
              throw new Error("No credential received");
            }

            const responseJson = JSON.stringify({
              id: credential.credentialId,
              rawId: credential.rawId,
              response: {
                authenticatorData: credential.response.authenticatorData,
                clientDataJSON: credential.response.clientDataJSON,
                signature: credential.response.signature,
              },
              type: credential.type,
            });

            this.webAuthnService.completePasskeyAuthentication(username, responseJson).subscribe({
              next: (result) => {
                if (result.verified) {
                  this.completePasswordlessLogin(result.username, false);
                } else {
                  this.notifyService.showError("Passkey verification failed");
                  this.submitted.set(false);
                }
              },
              error: (err) => {
                this.notifyService.showError(
                  "Passkey authentication failed: " + (err.message || err)
                );
                this.submitted.set(false);
              },
            });
          } catch (err: any) {
            this.notifyService.showError("Passkey authentication failed: " + (err.message || err));
            this.submitted.set(false);
          }
        },
        error: (err) => {
          this.notifyService.showError("Failed to initiate passkey: " + (err.message || err));
          this.submitted.set(false);
        },
      });
    } catch (err: any) {
      this.notifyService.showError("Passkey authentication failed: " + (err.message || err));
      this.submitted.set(false);
    }
  }

  async loginWithBiometric(): Promise<void> {
    this.submitted.set(true);
    this.isQrLoginActive.set(false);

    try {
      const isMobile = this.authCapabilityService.capabilities().isMobile;
      const isAndroidBiometric = await this.webAuthnService.isAndroidBiometricAvailable();

      if (isMobile && isAndroidBiometric) {
        const username = this.f["username"].value;
        if (!username) {
          this.notifyService.showError("Please enter your username first");
          this.submitted.set(false);
          return;
        }

        const success = await this.webAuthnService.authenticateAndroidBiometric(
          "Biometric Login",
          "Authenticate to login to TaskFlow"
        );

        if (success) {
          this.completePasswordlessLogin(username, false);
        } else {
          this.notifyService.showError("Biometric authentication failed");
          this.submitted.set(false);
        }
        return;
      }

      if (isMobile) {
        const username = this.f["username"].value;
        if (!username) {
          this.notifyService.showError("Please enter your username first");
          this.submitted.set(false);
          return;
        }

        this.securityService.initBiometricAuth(username).subscribe({
          next: async (authOptions) => {
            try {
              const credential = await navigator.credentials.get({
                publicKey: {
                  challenge: this.base64ToArrayBuffer(authOptions.options.challenge),
                  timeout: authOptions.options.timeout,
                  rpId: authOptions.options.rpId,
                  allowCredentials: authOptions.options.allowCredentials.map((cred: any) => ({
                    type: cred.type,
                    id: this.base64ToArrayBuffer(cred.id),
                    transports: cred.transports,
                  })),
                  userVerification: "required",
                },
              } as any);

              if (!credential) {
                throw new Error("No credential received");
              }

              const signature = this.arrayBufferToBase64((credential as any).response.signature);

              this.securityService.completeBiometricAuth(signature).subscribe({
                next: () => {
                  this.completePasswordlessLogin(username, false);
                },
                error: (err) => {
                  this.notifyService.showError(
                    "Biometric authentication failed: " + (err.message || err)
                  );
                  this.submitted.set(false);
                },
              });
            } catch (err: any) {
              this.notifyService.showError(
                "Biometric authentication failed: " + (err.message || err)
              );
              this.submitted.set(false);
            }
          },
          error: (err) => {
            this.notifyService.showError("Failed to initiate biometric: " + (err.message || err));
            this.submitted.set(false);
          },
        });
      } else {
        const isWebAuthN = await this.webAuthnService.isWebAuthnSupported();

        if (!isWebAuthN) {
          this.notifyService.showError("Biometric authentication is not supported on this device.");
          this.submitted.set(false);
          return;
        }

        const username = this.f["username"].value;
        if (!username) {
          this.notifyService.showError("Please enter your username first");
          this.submitted.set(false);
          return;
        }

        this.webAuthnService.initPasskeyAuthentication(username).subscribe({
          next: async (authOptions) => {
            try {
              const credential = await this.webAuthnService.getAssertion(authOptions.options);
              if (!credential) {
                throw new Error("No credential received");
              }

              const responseJson = JSON.stringify({
                id: credential.credentialId,
                rawId: credential.rawId,
                response: {
                  authenticatorData: credential.response.authenticatorData,
                  clientDataJSON: credential.response.clientDataJSON,
                  signature: credential.response.signature,
                },
                type: credential.type,
              });

              this.webAuthnService.completePasskeyAuthentication(username, responseJson).subscribe({
                next: (result) => {
                  if (result.verified) {
                    this.completePasswordlessLogin(result.username, false);
                  } else {
                    this.notifyService.showError("Biometric verification failed");
                    this.submitted.set(false);
                  }
                },
                error: (err) => {
                  this.notifyService.showError(
                    "Biometric authentication failed: " + (err.message || err)
                  );
                  this.submitted.set(false);
                },
              });
            } catch (err: any) {
              this.notifyService.showError(
                "Biometric authentication failed: " + (err.message || err)
              );
              this.submitted.set(false);
            }
          },
          error: (err) => {
            this.notifyService.showError("Failed to initiate biometric: " + (err.message || err));
            this.submitted.set(false);
          },
        });
      }
    } catch (err: any) {
      this.notifyService.showError("Biometric authentication failed: " + (err.message || err));
      this.submitted.set(false);
    }
  }

  private base64ToArrayBuffer(base64url: string): ArrayBuffer {
    let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  async loginWithQrCode(): Promise<void> {
    this.submitted.set(true);
    this.isQrLoginActive.set(true);

    try {
      // Username is now optional
      const username = this.f["username"].value;

      this.qrLoginService.generateQrCode(username || undefined).subscribe({
        next: (qrData) => {
          this.passkeyQrCode.set(this.sanitizer.bypassSecurityTrustResourceUrl(qrData.qrCode));
          this.qrLoginService.startPolling(qrData.token, 2000);

          // Start watching for QR approval
          this.watchQrApproval(qrData.token);

          this.notifyService.showInfo("Scan the QR code with your mobile device");
          this.submitted.set(false);
        },
        error: (err) => {
          this.notifyService.showError("Failed to generate QR code: " + (err.message || err));
          this.submitted.set(false);
          this.isQrLoginActive.set(false);
        },
      });
    } catch (err: any) {
      this.notifyService.showError("QR login failed: " + (err.message || err));
      this.submitted.set(false);
      this.isQrLoginActive.set(false);
    }
  }

  private watchQrApproval(token: string): void {
    // Watch for status changes to handle approval
    const checkApproval = () => {
      const status = this.qrLoginService.qrStatus();
      const statusData = this.qrLoginService.qrStatusData();

      if (status === "approved") {
        // QR approved, complete login via qrLoginComplete (generates JWT without password)
        this.qrLoginService.stopPolling();
        this.completeQrLogin(token);
      } else if (status === "expired") {
        this.notifyService.showError("QR code expired. Please try again.");
        this.cancelQrLogin();
      }
    };

    // Check every 2 seconds (aligned with polling interval)
    const interval = setInterval(checkApproval, 2000);

    // Store interval reference for cleanup
    setTimeout(() => clearInterval(interval), 95000); // Clear after token expiry (90s)
  }

  private async completeQrLogin(token: string): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.dataSyncProvider.invokeCommand<string>("qrLoginComplete", { token })
      );

      if (result) {
        if (this.f["remember"].value) {
          localStorage.setItem("token", result);
        } else {
          sessionStorage.setItem("token", result);
        }

        this.notifyService.showSuccess("Login successful");
        this.authStore.setAuthenticated(result);
        this.isQrLoginActive.set(false);
        this.router.navigate(["/dashboard"]);
      } else {
        this.notifyService.showError("Authentication failed - no token received");
        this.cancelQrLogin();
      }
    } catch (err: any) {
      this.notifyService.showError("QR login failed: " + (err.message || err));
      this.cancelQrLogin();
    } finally {
      this.submitted.set(false);
    }
  }

  private async completePasswordlessLogin(username: string, requiresTotp: boolean): Promise<void> {
    if (requiresTotp) {
      this.showTotpInput.set(true);
      this.submitted.set(false);
      return;
    }

    const authData: LoginForm = {
      username,
      password: "",
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
    } finally {
      this.submitted.set(false);
    }
  }

  cancelQrLogin(): void {
    this.qrLoginService.clearQrData();
    this.passkeyQrCode.set(null);
    this.isQrLoginActive.set(false);
  }
}
