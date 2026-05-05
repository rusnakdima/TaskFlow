import {
  Component,
  Output,
  EventEmitter,
  signal,
  ViewChild,
  ElementRef,
  OnDestroy,
  AfterViewInit,
} from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import jsQR from "jsqr";

@Component({
  selector: "app-qr-scanner",
  standalone: true,
  imports: [MatIconModule],
  templateUrl: "./qr-scanner.component.html",
  styleUrl: "./qr-scanner.component.scss",
})
export class QrScannerComponent implements OnDestroy, AfterViewInit {
  @ViewChild("qrVideo") qrVideoRef!: ElementRef<HTMLVideoElement>;

  @Output() close = new EventEmitter<void>();
  @Output() scanned = new EventEmitter<{ token: string; isDesktopTarget: boolean }>();
  @Output() approved = new EventEmitter<void>();

  title = "Scan QR Code";
  subtitle = "Point your camera at the QR code";
  statusPendingText = "Waiting for approval...";
  statusApprovedText = "Approved!";

  isLoading = signal(true);
  isApproved = signal(false);
  hasPermissionDenied = signal(false);
  status = signal<"pending" | "approved">("pending");

  private stream: MediaStream | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private animationFrameId: number | null = null;

  ngAfterViewInit(): void {
    this.startScanning();
  }

  async startScanning(): Promise<void> {
    try {
      this.isLoading.set(true);

      const permission = await navigator.permissions.query({ name: "camera" });
      if (permission.state === "denied") {
        this.hasPermissionDenied.set(true);
        this.isLoading.set(false);
        return;
      }

      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 720 }, height: { ideal: 720 } },
      });

      if (this.qrVideoRef?.nativeElement) {
        const videoElement = this.qrVideoRef.nativeElement;
        videoElement.srcObject = this.stream;
        await videoElement.play();
      }

      this.canvas = document.createElement("canvas");
      this.canvas.style.cssText = "display:none";
      document.body.appendChild(this.canvas);

      this.isLoading.set(false);
      this.scanFrame();
    } catch (error: any) {
      this.isLoading.set(false);
      throw error;
    }
  }

  private scanFrame(): void {
    if (!this.qrVideoRef?.nativeElement || !this.canvas || !this.stream) return;

    const video = this.qrVideoRef.nativeElement;
    const ctx = this.canvas.getContext("2d");

    if (!ctx) {
      this.stop();
      return;
    }

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      this.canvas.width = video.videoWidth;
      this.canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);

      const imageData = ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

      const code = jsQR(imageData.data, this.canvas.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });

      if (code && code.data) {
        this.handleResult(code.data);
        return;
      }
    }

    this.animationFrameId = requestAnimationFrame(() => this.scanFrame());
  }

  private handleResult(qrData: string): void {
    if (!qrData) return;

    const parsed = this.parseQrData(qrData);
    if (!parsed.token) return;

    this.stop();
    this.scanned.emit({ token: parsed.token, isDesktopTarget: parsed.isDesktopTarget });
  }

  private parseQrData(qrData: string): { token: string | null; isDesktopTarget: boolean } {
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

  setApproved(): void {
    this.isApproved.set(true);
    this.status.set("approved");
    this.approved.emit();
  }

  stop(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.canvas) {
      this.canvas.remove();
      this.canvas = null;
    }

    this.isLoading.set(false);
  }

  ngOnDestroy(): void {
    this.stop();
  }
}
