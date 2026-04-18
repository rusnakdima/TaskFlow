/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal, computed, OnDestroy, inject } from "@angular/core";
import { ActivatedRoute, RouterModule } from "@angular/router";
import { Subscription } from "rxjs";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Profile } from "@models/profile.model";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { NotifyService } from "@services/notifications/notify.service";
import { ApiProvider } from "@providers/api.provider";
import { StorageService } from "@services/core/storage.service";
import { DataLoaderService } from "@services/data/data-loader.service";
import { LocalAuthService } from "@services/auth/local-auth.service";

/* QR Decoder */
import jsQR from "jsqr";

@Component({
  selector: "app-profile",
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: "./profile.view.html",
})
export class ProfileView implements OnInit, OnDestroy {
  private routeSub?: Subscription;
  private localAuthService = inject(LocalAuthService);
  private dataSyncService = inject(DataLoaderService);

  constructor(
    private route: ActivatedRoute,
    private authService: AuthService,
    private dataSyncProvider: ApiProvider,
    private notifyService: NotifyService,
    private storageService: StorageService
  ) {}

  userId: string = "";

  // ✅ FIX: Use computed signal from StorageService
  profile = computed(() => this.storageService.profile());

  // Offline auth signals
  canExportData = signal(false);
  importError = signal<string | null>(null);
  showImportExport = signal(false);

  // QR Scanner
  isScanningQr = signal(false);
  qrVideoElement: HTMLVideoElement | null = null;
  qrStream: MediaStream | null = null;
  qrCanvasElement: HTMLCanvasElement | null = null;
  qrAnimationFrameId: number | null = null;

  ngOnInit(): void {
    this.userId = this.authService.getValueByKey("id");

    this.routeSub = this.route.queryParams.subscribe((params: any) => {
      if (params.id && params.id != "") {
        // Profile is loaded centrally in app.ts - just use cached signal
        const cachedProfile = this.storageService.profile();
        if (!cachedProfile) {
          // If somehow not cached, trigger a reload via DataLoaderService
          this.getProfile(params.id);
        }
      }
    });

    // Check if export is available
    this.canExportData.set(!!this.userId);
    this.showImportExport.set(true);
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.stopQrScanning();
  }

  isMyProfile(): boolean {
    const profile = this.profile();
    return profile !== null && profile.userId === this.authService.getValueByKey("id");
  }

  getProfile(userId: string) {
    // Only called when profile not in cache - use DataLoaderService
    this.dataSyncService.loadProfile().subscribe();
  }

  /**
   * Export user data for offline backup
   */
  exportUserData() {
    const userData = this.authService.exportUserData();
    if (!userData) {
      this.notifyService.showError("Failed to export user data");
      return;
    }

    // Create download blob
    const blob = new Blob([userData], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `taskflow-user-${this.userId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.notifyService.showSuccess("User data exported successfully");
  }

  /**
   * Import user data from file
   */
  importUserData(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const result = e.target?.result as string;
        const importResult = this.authService.importUserData(result);

        if (importResult.success) {
          this.notifyService.showSuccess(
            "User data imported. Please login with your password to complete setup."
          );
          this.importError.set(null);
          // Redirect to login to complete auth
          setTimeout(() => {
            window.location.href = "/login";
          }, 1000);
        } else {
          this.importError.set(importResult.error || "Import failed");
          this.notifyService.showError(importResult.error || "Import failed");
        }
      } catch {
        this.importError.set("Invalid file format");
        this.notifyService.showError("Invalid file format");
      }
    };

    reader.readAsText(file);
    // Reset input
    input.value = "";
  }

  /**
   * Logout keeping offline data
   */
  logout() {
    this.authService.logout();
  }

  /**
   * Full logout - clear all offline data
   */
  logoutAll() {
    if (confirm("This will remove all offline login data. Are you sure?")) {
      this.authService.logoutAll();
    }
  }

  /**
   * Start QR code scanning for desktop login approval using native getUserMedia
   */
  async startQrScanning(): Promise<void> {
    if (this.isScanningQr()) return;

    try {
      this.isScanningQr.set(true);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      this.qrStream = stream;

      const videoElement = document.createElement("video");
      videoElement.style.cssText =
        "position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;background:black;object-fit:cover;";
      videoElement.id = "qr-scanner-video";
      videoElement.setAttribute("playsinline", "true");
      document.body.appendChild(videoElement);
      this.qrVideoElement = videoElement;

      videoElement.srcObject = stream;
      await videoElement.play();

      const canvas = document.createElement("canvas");
      canvas.style.cssText = "display:none";
      document.body.appendChild(canvas);
      this.qrCanvasElement = canvas;

      this.notifyService.showInfo("Point camera at QR code");

      this.scanQrFrame();
    } catch (error: any) {
      let errorMsg = "Failed to start camera";
      if (error.name === "NotAllowedError") {
        errorMsg = "Camera permission denied";
      } else if (error.name === "NotFoundError") {
        errorMsg = "No camera found on this device";
      }
      this.notifyService.showError(errorMsg + ": " + (error.message || error));
      this.stopQrScanning();
    }
  }

  /**
   * Scan QR code from video frame using jsQR library
   */
  private scanQrFrame(): void {
    if (!this.qrVideoElement || !this.qrCanvasElement || !this.isScanningQr()) return;

    const video = this.qrVideoElement;
    const canvas = this.qrCanvasElement;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      this.stopQrScanning();
      return;
    }

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Use jsQR to decode QR code
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });

      if (code && code.data) {
        this.handleQrCodeResult(code.data);
        return;
      }
    }

    this.qrAnimationFrameId = requestAnimationFrame(() => this.scanQrFrame());
  }

  /**
   * Handle QR code result from scanning
   */
  private async handleQrCodeResult(qrData: string): Promise<void> {
    if (!qrData) return;

    this.stopQrScanning();

    let token: string | null = null;

    try {
      if (qrData.startsWith("taskflow://qrlogin?data=")) {
        const dataPart = qrData.replace("taskflow://qrlogin?data=", "");
        const parsed = JSON.parse(decodeURIComponent(dataPart));
        token = parsed.t;
      } else if (qrData.includes("t=")) {
        const params = new URLSearchParams(qrData.replace("taskflow://qrlogin?", ""));
        token = params.get("t");
      } else {
        const parsed = JSON.parse(qrData);
        token = parsed.t || parsed.token;
      }
    } catch {
      try {
        const params = new URLSearchParams(qrData.split("?")[1] || "");
        token = params.get("t");
      } catch {
        token = null;
      }
    }

    if (!token) {
      this.notifyService.showError("Invalid QR code");
      return;
    }

    this.approveQrLogin(token);
  }

  /**
   * Approve desktop login via QR code
   */
  private approveQrLogin(token: string): void {
    const username = this.authService.getValueByKey("username");
    if (!username) {
      this.notifyService.showError("You must be logged in to approve QR login");
      return;
    }

    this.dataSyncProvider
      .invokeCommand<{ success: boolean }>("qrApprove", {
        token,
        username,
      })
      .subscribe({
        next: () => {
          this.notifyService.showSuccess("Login approved! Desktop can now continue.");
        },
        error: (err: any) => {
          this.notifyService.showError("Failed to approve: " + (err.message || err));
        },
      });
  }

  /**
   * Stop QR code scanning
   */
  stopQrScanning(): void {
    if (this.qrAnimationFrameId) {
      cancelAnimationFrame(this.qrAnimationFrameId);
      this.qrAnimationFrameId = null;
    }

    if (this.qrStream) {
      this.qrStream.getTracks().forEach((track) => track.stop());
      this.qrStream = null;
    }

    if (this.qrVideoElement) {
      this.qrVideoElement.srcObject = null;
      this.qrVideoElement.remove();
      this.qrVideoElement = null;
    }

    if (this.qrCanvasElement) {
      this.qrCanvasElement.remove();
      this.qrCanvasElement = null;
    }

    this.isScanningQr.set(false);
  }
}
