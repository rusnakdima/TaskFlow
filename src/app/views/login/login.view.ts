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
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";
import { firstValueFrom } from "rxjs";

import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatButtonModule } from "@angular/material/button";

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

import jsQR from "jsqr";

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
    MatProgressSpinnerModule,
    MatButtonModule,
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

  readonly isMobileDevice = computed(() => this.capabilities().isMobile);

  readonly hasAlternativeLoginMethods = computed(() => {
    return this.showPasskeyButton() || this.showBiometricButton() || this.showQrLoginButton();
  });

  readonly platformName = computed(() => this.capabilities().platformName);

  readonly isQrLoginActive = signal(false);
  readonly qrLoginStatus = this.qrLoginService.qrStatus;
  readonly isQrLoginPolling = this.qrLoginService.isPolling;
  readonly isQrGenerating = signal(false);

  readonly isMobileScanning = signal(false);
  readonly isQrScanningLoading = signal(false);
  mobileQrVideoElement: HTMLVideoElement | null = null;
  mobileQrStream: MediaStream | null = null;
  mobileQrCanvasElement: HTMLCanvasElement | null = null;
  mobileQrAnimationFrameId: number | null = null;

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
        const activeUsers = (users || []).filter((u) => !u.deletedAt);
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
    this.stopMobileQrScanning();
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
      const { token, requiresDataSync, isOffline, needsProfile, profile, userId } = result;

      if (!token) {
        this.notifyService.showError("No authentication token available");
        this.submitted.set(false);
        return;
      }

      if (this.f["remember"].value) {
        localStorage.setItem("token", token);
        if (userId) {
          localStorage.setItem("userId", userId);
        }
      } else {
        sessionStorage.setItem("token", token);
      }

      if (needsProfile) {
        this.notifyService.showInfo("Please complete your profile setup");
        window.location.href = "/profile/create-profile";
        return;
      }

      if (isOffline) {
        this.notifyService.showWarning("Working offline - some features limited");
      } else {
        this.notifyService.showSuccess("Login successful");
      }

      window.location.href = "/";
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (NetworkErrorHelper.isNetworkError(err)) {
        if (this.hasLocalUsers()) {
          this.notifyService.showError("No internet connection. Using local database...");
        } else {
          this.notifyService.showError(
            "Cannot connect to database.\n\nPlease check:\n1. Your internet connection\n2. Backend server is running\n3. Database connection is configured\n\nYou must connect to the database at least once to login."
          );
        }
      } else if (errorMessage.includes("User data exists but no cached token")) {
        this.notifyService.showError(
          "User found locally but no cached token. Please login online to refresh your session."
        );
      } else {
        this.notifyService.showError(errorMessage);
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
          next: (authResponse) => {
            const token = authResponse.token;
            if (this.f["remember"].value) {
              localStorage.setItem("token", token);
            } else {
              sessionStorage.setItem("token", token);
            }

            if (authResponse.needsProfile) {
              this.notifyService.showInfo("Please complete your profile setup");
              window.location.href = "/profile/create-profile";
            } else {
              this.notifyService.showSuccess("Login successful");
              window.location.href = "/";
            }
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
                this.notifyService.showError(
                  "Passkey authentication failed: " + (err.message || err)
                );
                this.submitted.set(false);
              },
            });
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Passkey authentication failed";
            this.notifyService.showError("Passkey authentication failed: " + message);
            this.submitted.set(false);
          }
        },
        error: (err: unknown) => {
          const message = err instanceof Error ? err.message : "Failed to initiate passkey";
          this.notifyService.showError("Failed to initiate passkey: " + message);
          this.submitted.set(false);
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Operation failed";
      this.notifyService.showError(message);
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
                error: (err: unknown) => {
                  const message =
                    err instanceof Error ? err.message : "Biometric authentication failed";
                  this.notifyService.showError("Biometric authentication failed: " + message);
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
      const message = err instanceof Error ? err.message : "Biometric authentication failed";
      this.notifyService.showError("Biometric authentication failed: " + message);
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
    if (this.isMobileDevice()) {
      await this.startMobileQrScanning();
      return;
    }

    this.submitted.set(true);
    this.isQrLoginActive.set(true);
    this.isQrGenerating.set(true);

    try {
      const username = this.f["username"].value;

      this.qrLoginService.generateQrCode(username || undefined).subscribe({
        next: (qrData) => {
          this.passkeyQrCode.set(this.sanitizer.bypassSecurityTrustResourceUrl(qrData.qrCode));
          this.qrLoginService.startPolling(qrData.token, 2000);
          this.isQrGenerating.set(false);

          this.watchQrApproval(qrData.token);

          this.notifyService.showInfo("Scan the QR code with your mobile device");
          this.submitted.set(false);
        },
        error: (err) => {
          this.notifyService.showError("Failed to generate QR code: " + (err.message || err));
          this.submitted.set(false);
          this.isQrLoginActive.set(false);
          this.isQrGenerating.set(false);
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "QR login failed";
      this.notifyService.showError("QR login failed: " + message);
      this.submitted.set(false);
      this.isQrLoginActive.set(false);
      this.isQrGenerating.set(false);
    }
  }

  async startMobileQrScanning(): Promise<void> {
    if (this.isMobileScanning()) return;

    try {
      this.isMobileScanning.set(true);
      this.isQrLoginActive.set(true);
      this.isQrScanningLoading.set(true);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      this.mobileQrStream = stream;
      this.isQrScanningLoading.set(false);

      const videoElement = document.createElement("video");
      videoElement.style.cssText =
        "position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;background:black;object-fit:cover;";
      videoElement.id = "mobile-qr-scanner-video";
      videoElement.setAttribute("playsinline", "true");
      document.body.appendChild(videoElement);
      this.mobileQrVideoElement = videoElement;

      videoElement.srcObject = stream;
      await videoElement.play();

      const canvas = document.createElement("canvas");
      canvas.style.cssText = "display:none";
      document.body.appendChild(canvas);
      this.mobileQrCanvasElement = canvas;

      this.notifyService.showInfo("Point camera at QR code to login");

      this.scanMobileQrFrame();
    } catch (error: any) {
      this.isQrScanningLoading.set(false);
      let errorMsg = "Failed to start camera";
      if (error.name === "NotAllowedError") {
        errorMsg = "Camera permission denied";
      } else if (error.name === "NotFoundError") {
        errorMsg = "No camera found on this device";
      }
      this.notifyService.showError(errorMsg + ": " + (error.message || error));
      this.stopMobileQrScanning();
    }
  }

  private scanMobileQrFrame(): void {
    if (!this.mobileQrVideoElement || !this.mobileQrCanvasElement || !this.isMobileScanning())
      return;

    const video = this.mobileQrVideoElement;
    const canvas = this.mobileQrCanvasElement;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      this.stopMobileQrScanning();
      return;
    }

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });

      if (code && code.data) {
        this.handleMobileQrCodeResult(code.data);
        return;
      }
    }

    this.mobileQrAnimationFrameId = requestAnimationFrame(() => this.scanMobileQrFrame());
  }

  private async handleMobileQrCodeResult(qrData: string): Promise<void> {
    if (!qrData) return;

    this.stopMobileQrScanning();

    let token: string | null = null;
    let isDesktopTarget = false;

    try {
      if (qrData.startsWith("taskflow://qrlogin?data=")) {
        const dataPart = qrData.replace("taskflow://qrlogin?data=", "");
        const parsed = JSON.parse(decodeURIComponent(dataPart));
        token = parsed.t;
        isDesktopTarget = parsed.d === "desktop";
      } else if (qrData.includes("t=")) {
        const params = new URLSearchParams(qrData.replace("taskflow://qrlogin?", ""));
        token = params.get("t");
        isDesktopTarget = params.get("d") === "desktop";
      } else {
        const parsed = JSON.parse(qrData);
        token = parsed.t || parsed.token;
        isDesktopTarget = parsed.d === "desktop";
      }
    } catch {
      try {
        const params = new URLSearchParams(qrData.split("?")[1] || "");
        token = params.get("t");
        isDesktopTarget = params.get("d") === "desktop";
      } catch {
        token = null;
      }
    }

    if (!token) {
      this.notifyService.showError("Invalid QR code");
      this.isQrLoginActive.set(false);
      return;
    }

    if (isDesktopTarget) {
      this.completeQrLogin(token);
    } else {
      this.approveMobileQrLogin(token, "mobile");
    }
  }

  private approveMobileQrLogin(token: string, username: string): void {
    this.dataSyncProvider
      .invokeCommand<{ success: boolean }>("qrApprove", { token, username })
      .subscribe({
        next: () => {
          this.notifyService.showSuccess("Login approved!");
          this.completeQrLogin(token);
        },
        error: (err: any) => {
          this.notifyService.showError("Failed to approve: " + (err.message || err));
          this.isQrLoginActive.set(false);
        },
      });
  }

  stopMobileQrScanning(): void {
    if (this.mobileQrAnimationFrameId) {
      cancelAnimationFrame(this.mobileQrAnimationFrameId);
      this.mobileQrAnimationFrameId = null;
    }

    if (this.mobileQrStream) {
      this.mobileQrStream.getTracks().forEach((track) => track.stop());
      this.mobileQrStream = null;
    }

    if (this.mobileQrVideoElement) {
      this.mobileQrVideoElement.srcObject = null;
      this.mobileQrVideoElement.remove();
      this.mobileQrVideoElement = null;
    }

    if (this.mobileQrCanvasElement) {
      this.mobileQrCanvasElement.remove();
      this.mobileQrCanvasElement = null;
    }

    this.isMobileScanning.set(false);
    this.isQrScanningLoading.set(false);
    this.isQrLoginActive.set(false);
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
        window.location.href = "/";
      } else {
        this.notifyService.showError("Authentication failed - no token received");
        this.cancelQrLogin();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "QR login failed";
      this.notifyService.showError("QR login failed: " + message);
      this.cancelQrLogin();
    } finally {
      this.submitted.set(false);
    }
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
      if (this.f["remember"].value) {
        localStorage.setItem("token", authResponse.token);
      } else {
        sessionStorage.setItem("token", authResponse.token);
      }

      if (authResponse.needsProfile) {
        this.notifyService.showInfo("Please complete your profile setup");
        window.location.href = "/profile/create-profile";
      } else {
        this.notifyService.showSuccess("Login successful");
        this.authStore.setAuthenticated(authResponse.token);
        window.location.href = "/";
      }
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

        if (loginResult.needsProfile) {
          this.notifyService.showInfo("Please complete your profile setup");
          window.location.href = "/profile/create-profile";
        } else {
          this.notifyService.showSuccess("Login successful");
          this.authStore.setAuthenticated(loginResult.token);
          window.location.href = "/";
        }
      } else {
        this.notifyService.showError("Authentication failed - no token received");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Login failed";
      this.notifyService.showError("Login failed: " + message);
    } finally {
      this.submitted.set(false);
    }
  }

  cancelQrLogin(): void {
    this.qrLoginService.stopPolling();
    this.qrLoginService.clearQrData();
    this.passkeyQrCode.set(null);
    this.isQrLoginActive.set(false);
    this.isQrGenerating.set(false);
    this.submitted.set(false);
  }
}
