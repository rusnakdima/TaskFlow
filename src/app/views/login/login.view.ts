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
  AbstractControl,
} from "@angular/forms";
import { Router, RouterModule } from "@angular/router";

import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatButtonModule } from "@angular/material/button";

import { LoginForm } from "@models/auth-forms.model";
import { CheckboxField, TypeField } from "@models/form-field.model";

import { AuthService } from "@services/auth/auth.service";
import { SecurityService, UserSecurityStatus } from "@services/auth/security.service";
import { NotifyService } from "@services/notifications/notify.service";
import { ApiProvider } from "@providers/api.provider";
import { AuthCapabilityService } from "@services/auth/auth-capability.service";
import { WebAuthnService } from "@services/auth/webauthn.service";

import { AuthStore } from "@stores/auth.store";
import { StorageService } from "@services/core/storage.service";

import { NetworkErrorHelper } from "@helpers/network-error.helper";
import { CryptoHelper } from "@helpers/crypto.helper";
import { LoginCompletionHelper } from "@helpers/login-completion.helper";
import { LoginErrorHelper } from "@helpers/login-error.helper";

import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

@Component({
  selector: "app-login",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [AuthService, SecurityService, AuthCapabilityService, WebAuthnService],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    CheckboxComponent,
  ],
  templateUrl: "./login.view.html",
})
export class LoginView implements OnDestroy {
  loginForm!: FormGroup<any>;
  private authStore = inject(AuthStore);
  private authCapabilityService = inject(AuthCapabilityService);
  private webAuthnService = inject(WebAuthnService);
  private router = inject(Router);
  private storageService = inject(StorageService);

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
    return caps.qrLoginAvailable;
  });

  readonly isMobileDevice = computed(() => this.capabilities().isMobile);

  readonly hasAlternativeLoginMethods = computed(() => {
    return this.showPasskeyButton() || this.showBiometricButton() || this.showQrLoginButton();
  });

  readonly platformName = computed(() => this.capabilities().platformName);

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    public securityService: SecurityService,
    private notifyService: NotifyService,
    private dataSyncProvider: ApiProvider
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
    this.dataSyncProvider
      .crud<any[]>("getAll", "users", { isOwner: true, isPrivate: true }, true)
      .subscribe({
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
      Object.values(this.loginForm.controls).forEach((control: AbstractControl) => {
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
      const { token, isOffline } = result;

      if (!token) {
        this.notifyService.showError("No authentication token available");
        this.submitted.set(false);
        return;
      }

      LoginCompletionHelper.completeLogin({
        token,
        remember: this.f["remember"].value,
      });

      if (isOffline) {
        this.notifyService.showWarning("Working offline - some features limited");
      } else {
        this.notifyService.showSuccess("Login successful");
      }
    } catch (err: unknown) {
      LoginErrorHelper.handleAuthError(err, this.notifyService, this.hasLocalUsers());
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
          next: (authResponse) => {
            // Store profile if provided
            if (authResponse.profile && !authResponse.needsProfile) {
              this.storageService.setCollection("profiles", authResponse.profile);
            }

            LoginCompletionHelper.completeLogin({
              token: authResponse.token,
              remember: this.f["remember"].value,
            });
            resolve();
          },
          error: (err) => reject(err),
        });
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Invalid TOTP code";
      this.notifyService.showError("Invalid TOTP code: " + message);
    }
  }

  async loginWithPasskey(): Promise<void> {
    this.submitted.set(true);

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
                  this.completePasswordlessLogin(result.username, false, {
                    token: "",
                    needsProfile: result.needsProfile,
                    profile: result.profile,
                  });
                } else {
                  this.notifyService.showError("Passkey verification failed");
                  this.submitted.set(false);
                }
              },
              error: (err) => {
                LoginErrorHelper.handleWebAuthnError(
                  err,
                  this.notifyService,
                  "Passkey authentication"
                );
                this.submitted.set(false);
              },
            });
          } catch (err: unknown) {
            LoginErrorHelper.handleWebAuthnError(err, this.notifyService, "Passkey authentication");
            this.submitted.set(false);
          }
        },
        error: (err: unknown) => {
          LoginErrorHelper.handleWebAuthnError(
            err,
            this.notifyService,
            "Failed to initiate passkey"
          );
          this.submitted.set(false);
        },
      });
    } catch (err: unknown) {
      LoginErrorHelper.handleWebAuthnError(err, this.notifyService);
      this.submitted.set(false);
    }
  }

  async loginWithBiometric(): Promise<void> {
    this.submitted.set(true);

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
                  challenge: CryptoHelper.base64ToArrayBuffer(authOptions.options.challenge),
                  timeout: authOptions.options.timeout,
                  rpId: authOptions.options.rpId,
                  allowCredentials: authOptions.options.allowCredentials.map((cred: any) => ({
                    type: cred.type,
                    id: CryptoHelper.base64ToArrayBuffer(cred.id),
                    transports: cred.transports,
                  })),
                  userVerification: "required",
                },
              } as any);

              if (!credential) {
                throw new Error("No credential received");
              }

              const signature = CryptoHelper.arrayBufferToBase64(
                (credential as any).response.signature
              );

              this.securityService.completeBiometricAuth(signature).subscribe({
                next: () => {
                  this.completePasswordlessLogin(username, false);
                },
                error: (err: unknown) => {
                  LoginErrorHelper.handleBiometricError(err, this.notifyService);
                  this.submitted.set(false);
                },
              });
            } catch (err: unknown) {
              LoginErrorHelper.handleBiometricError(err, this.notifyService);
              this.submitted.set(false);
            }
          },
          error: (err: unknown) => {
            LoginErrorHelper.handleBiometricError(
              err,
              this.notifyService,
              "Failed to initiate biometric"
            );
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
                  LoginErrorHelper.handleBiometricError(err, this.notifyService);
                  this.submitted.set(false);
                },
              });
            } catch (err: unknown) {
              const message =
                err instanceof Error ? err.message : "Biometric authentication failed";
              this.notifyService.showError("Biometric authentication failed: " + message);
              this.submitted.set(false);
            }
          },
          error: (err: unknown) => {
            const message = err instanceof Error ? err.message : "Failed to initiate biometric";
            this.notifyService.showError("Failed to initiate biometric: " + message);
            this.submitted.set(false);
          },
        });
      }
    } catch (err: unknown) {
      LoginErrorHelper.handleBiometricError(err, this.notifyService);
      this.submitted.set(false);
    }
  }

  goToQrLogin(): void {
    this.router.navigate(["/login/qr"]);
  }

  private async completePasswordlessLogin(
    username: string,
    requiresTotp: boolean,
    authResponse?: { token: string; needsProfile: boolean; profile: any | null }
  ): Promise<void> {
    if (requiresTotp) {
      this.showTotpInput.set(true);
      this.submitted.set(false);
      return;
    }

    if (authResponse?.token) {
      // Store profile if provided
      if (authResponse.profile && !authResponse.needsProfile) {
        this.storageService.setCollection("profiles", authResponse.profile);
      }

      LoginCompletionHelper.completeLogin({
        token: authResponse.token,
        remember: this.f["remember"].value,
      });
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
        LoginCompletionHelper.completeLogin({
          token: loginResult.token,
          remember: this.f["remember"].value,
        });
      } else {
        this.notifyService.showError("Authentication failed - no token received");
      }
    } catch (err: unknown) {
      LoginErrorHelper.handleAuthError(err, this.notifyService, this.hasLocalUsers());
    } finally {
      this.submitted.set(false);
    }
  }
}
