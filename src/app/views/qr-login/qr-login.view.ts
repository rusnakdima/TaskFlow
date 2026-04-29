import {
  Component,
  OnDestroy,
  OnInit,
  inject,
  signal,
  computed,
  ViewChild,
  ElementRef,
  ChangeDetectionStrategy,
  AfterViewInit,
} from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";
import { firstValueFrom } from "rxjs";

import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatButtonModule } from "@angular/material/button";

import { QrLoginService } from "@services/auth/qr-login.service";
import { AuthCapabilityService } from "@services/auth/auth-capability.service";
import { NotifyService } from "@services/notifications/notify.service";
import { ApiProvider } from "@providers/api.provider";
import { AuthStore } from "@stores/auth.store";

import { LoginCompletionHelper } from "@helpers/login-completion.helper";
import { LoginErrorHelper } from "@helpers/login-error.helper";

import jsQR from "jsqr";

@Component({
  selector: "app-qr-login",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [QrLoginService],
  imports: [MatIconModule, MatProgressSpinnerModule, MatButtonModule],
  templateUrl: "./qr-login.view.html",
})
export class QrLoginView implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild("qrVideo") qrVideoRef!: ElementRef<HTMLVideoElement>;

  private qrLoginService = inject(QrLoginService);
  private authCapabilityService = inject(AuthCapabilityService);
  private notifyService = inject(NotifyService);
  private dataSyncProvider = inject(ApiProvider);
  private sanitizer = inject(DomSanitizer);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private authStore = inject(AuthStore);

  readonly isMobileDevice = computed(() => this.authCapabilityService.capabilities().isMobile);

  readonly isQrLoginActive = signal(false);
  readonly qrLoginStatus = this.qrLoginService.qrStatus;
  readonly isQrLoginPolling = this.qrLoginService.isPolling;
  readonly isQrGenerating = signal(false);
  passkeyQrCode = signal<SafeResourceUrl | null>(null);

  readonly isMobileScanning = signal(false);
  readonly isQrScanningLoading = signal(false);
  mobileQrStream: MediaStream | null = null;
  mobileQrCanvasElement: HTMLCanvasElement | null = null;
  mobileQrAnimationFrameId: number | null = null;

  username = signal<string>("");

  private parseQrData(qrData: string): { token: string | null; isDesktopTarget: boolean } {
    if (!qrData) {
      return { token: null, isDesktopTarget: false };
    }

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

    return { token, isDesktopTarget };
  }

  ngOnInit(): void {
    const usernameFromRoute = this.route.snapshot.queryParamMap.get("username") || "";
    this.username.set(usernameFromRoute);
  }

  ngAfterViewInit(): void {
    this.loginWithQrCode();
  }

  ngOnDestroy(): void {
    this.stopMobileQrScanning();
    this.qrLoginService.clearQrData();
  }

  async loginWithQrCode(): Promise<void> {
    if (this.isMobileDevice()) {
      await this.startMobileQrScanning();
      return;
    }

    this.isQrLoginActive.set(true);
    this.isQrGenerating.set(true);

    try {
      this.qrLoginService.generateQrCode(this.username() || undefined).subscribe({
        next: (qrData) => {
          this.passkeyQrCode.set(this.sanitizer.bypassSecurityTrustResourceUrl(qrData.qrCode));
          this.qrLoginService.startPolling(qrData.token, 2000);
          this.isQrGenerating.set(false);

          this.watchQrApproval(qrData.token);

          this.notifyService.showInfo("Scan the QR code with your mobile device");
        },
        error: (err) => {
          LoginErrorHelper.handleQrError(err, this.notifyService, "Failed to generate QR code");
          this.isQrLoginActive.set(false);
          this.isQrGenerating.set(false);
        },
      });
    } catch (err: unknown) {
      LoginErrorHelper.handleQrError(err, this.notifyService, "QR login");
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
        video: { facingMode: "environment", width: { ideal: 720 }, height: { ideal: 720 } },
      });
      this.mobileQrStream = stream;
      this.isQrScanningLoading.set(false);

      if (this.qrVideoRef?.nativeElement) {
        const videoElement = this.qrVideoRef.nativeElement;
        videoElement.srcObject = stream;
        await videoElement.play();
      }

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
    if (!this.qrVideoRef?.nativeElement || !this.mobileQrCanvasElement || !this.isMobileScanning())
      return;

    const video = this.qrVideoRef.nativeElement;
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

      const code = jsQR(imageData.data, canvas.width, imageData.height, {
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

    const parsed = this.parseQrData(qrData);

    if (!parsed.token) {
      this.notifyService.showError("Invalid QR code");
      this.isQrLoginActive.set(false);
      return;
    }

    if (parsed.isDesktopTarget) {
      this.completeQrLogin(parsed.token);
    } else {
      this.approveMobileQrLogin(parsed.token, "mobile");
    }
  }

  private approveMobileQrLogin(token: string, username: string): void {
    this.dataSyncProvider
      .invokeCommand<{ success: boolean }>("qr_approve", { token, username })
      .subscribe({
        next: () => {
          this.notifyService.showSuccess("Login approved!");
          this.completeQrLogin(token);
        },
        error: (err: any) => {
          LoginErrorHelper.handleQrError(err, this.notifyService, "QR approval");
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

    if (this.mobileQrCanvasElement) {
      this.mobileQrCanvasElement.remove();
      this.mobileQrCanvasElement = null;
    }

    this.isMobileScanning.set(false);
    this.isQrScanningLoading.set(false);
    this.isQrLoginActive.set(false);
  }

  private watchQrApproval(token: string): void {
    const checkApproval = () => {
      const status = this.qrLoginService.qrStatus();
      const statusData = this.qrLoginService.qrStatusData();

      if (status === "approved") {
        this.qrLoginService.stopPolling();
        this.completeQrLogin(token);
      } else if (status === "expired") {
        this.notifyService.showError("QR code expired. Please try again.");
        this.cancelQrLogin();
      }
    };

    const interval = setInterval(checkApproval, 2000);
    setTimeout(() => clearInterval(interval), 95000);
  }

  private async completeQrLogin(token: string): Promise<void> {
    try {
      const authResponse = await firstValueFrom(
        this.dataSyncProvider.invokeCommand<{
          token: string;
          needsProfile: boolean;
          profile: any;
          userId: string;
        }>("qr_login_complete", { token })
      );

      if (authResponse && authResponse.token) {
        LoginCompletionHelper.completeLogin({
          token: authResponse.token,
          remember: false,
        });
        this.authStore.setAuthenticated(authResponse.token);
      } else {
        this.notifyService.showError("Authentication failed - no token received");
        this.cancelQrLogin();
      }
    } catch (err: unknown) {
      LoginErrorHelper.handleQrError(err, this.notifyService, "QR login");
      this.cancelQrLogin();
    } finally {
      this.isQrGenerating.set(false);
    }
  }

  cancelQrLogin(): void {
    this.qrLoginService.stopPolling();
    this.qrLoginService.clearQrData();
    this.passkeyQrCode.set(null);
    this.isQrLoginActive.set(false);
    this.isQrGenerating.set(false);
    this.router.navigate(["/login"]);
  }
}
