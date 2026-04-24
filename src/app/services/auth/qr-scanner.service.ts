import { Injectable, signal, inject, NgZone } from "@angular/core";
import jsQR from "jsqr";
import { NotifyService } from "@services/notifications/notify.service";

@Injectable({
  providedIn: "root",
})
export class QrScannerService {
  private notifyService = inject(NotifyService);
  private ngZone = inject(NgZone);

  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private stream: MediaStream | null = null;
  private animationFrameId: number | null = null;

  readonly isScanning = signal(false);
  readonly isLoading = signal(false);

  private onQrDetectedCallback: ((data: string) => void) | null = null;

  async startScanning(
    videoElement: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    onQrDetected: (data: string) => void
  ): Promise<void> {
    this.videoElement = videoElement;
    this.canvasElement = canvas;
    this.onQrDetectedCallback = onQrDetected;

    try {
      this.isLoading.set(true);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      this.stream = stream;
      this.isLoading.set(false);

      videoElement.srcObject = stream;
      await videoElement.play();

      this.isScanning.set(true);
      this.scanFrame();
    } catch (error: any) {
      this.isLoading.set(false);
      let errorMsg = "Failed to start camera";
      if (error.name === "NotAllowedError") {
        errorMsg = "Camera permission denied";
      } else if (error.name === "NotFoundError") {
        errorMsg = "No camera found on this device";
      }
      this.notifyService.showError(errorMsg + ": " + (error.message || error));
      this.stopScanning();
    }
  }

  private scanFrame(): void {
    if (!this.videoElement || !this.canvasElement || !this.isScanning()) return;

    const video = this.videoElement;
    const canvas = this.canvasElement;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      this.stopScanning();
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

      if (code && code.data && this.onQrDetectedCallback) {
        this.ngZone.run(() => {
          this.onQrDetectedCallback!(code.data); // code.data is a string
        });
        return;
      }
    }

    this.animationFrameId = requestAnimationFrame(() => this.scanFrame());
  }

  stopScanning(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }

    this.canvasElement = null;
    this.onQrDetectedCallback = null;
    this.isScanning.set(false);
    this.isLoading.set(false);
  }

  createVideoElement(): HTMLVideoElement {
    const video = document.createElement("video");
    video.style.cssText =
      "position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;background:black;object-fit:cover;";
    video.setAttribute("playsinline", "true");
    document.body.appendChild(video);
    return video;
  }

  createCanvasElement(): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "display:none";
    document.body.appendChild(canvas);
    return canvas;
  }

  removeElement(element: HTMLElement): void {
    element.remove();
  }
}
