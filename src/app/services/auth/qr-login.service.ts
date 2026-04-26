import { Injectable, inject, signal } from "@angular/core";
import { interval, Subscription, Observable } from "rxjs";
import { ApiProvider } from "@providers/api.provider";

export type QrStatus = "pending" | "approved" | "expired";

export interface QrCodeData {
  token: string;
  qrCode: string;
  expiresAt: number;
  username?: string;
}

export interface QrGenerationResult {
  token: string;
  qrCode: string;
  expiresAt: number;
}

export interface QrStatusResult {
  status: QrStatus;
  username?: string;
  approvedBy?: string;
}

@Injectable({
  providedIn: "root",
})
export class QrLoginService {
  private dataSyncProvider = inject(ApiProvider);

  private pollSubscription: Subscription | null = null;

  readonly currentQrData = signal<QrCodeData | null>(null);
  readonly qrStatus = signal<QrStatus>("pending");
  readonly qrStatusData = signal<QrStatusResult | null>(null);
  readonly isPolling = signal(false);

  generateQrCode(username?: string): Observable<QrGenerationResult> {
    return new Observable((observer) => {
      this.dataSyncProvider
        .invokeCommand<QrGenerationResult>("qr_generate", { username: username || null })
        .subscribe({
          next: (data) => {
            this.currentQrData.set({
              token: data.token,
              qrCode: data.qrCode,
              expiresAt: data.expiresAt,
            });
            this.qrStatus.set("pending");
            observer.next(data);
            observer.complete();
          },
          error: (err) => observer.error(err),
        });
    });
  }

  generateQrCodeForDesktopLogin(username: string): Observable<QrGenerationResult> {
    return new Observable((observer) => {
      this.dataSyncProvider
        .invokeCommand<QrGenerationResult>("qr_generate_for_desktop", { username })
        .subscribe({
          next: (data) => {
            this.currentQrData.set({
              token: data.token,
              qrCode: data.qrCode,
              expiresAt: data.expiresAt,
              username,
            });
            this.qrStatus.set("approved");
            observer.next(data);
            observer.complete();
          },
          error: (err) => observer.error(err),
        });
    });
  }

  startPolling(token: string, intervalMs: number = 2000): void {
    this.stopPolling();

    this.isPolling.set(true);
    this.pollSubscription = interval(intervalMs).subscribe(() => {
      this.checkStatus(token);
    });
  }

  stopPolling(): void {
    if (this.pollSubscription) {
      this.pollSubscription.unsubscribe();
      this.pollSubscription = null;
    }
    this.isPolling.set(false);
  }

  private checkStatus(token: string): void {
    this.dataSyncProvider.invokeCommand<QrStatusResult>("qr_status", { token }).subscribe({
      next: (data) => {
        this.qrStatus.set(data.status);
        this.qrStatusData.set(data);

        if (data.status === "approved" || data.status === "expired") {
          this.stopPolling();
        }
      },
      error: () => {
        this.qrStatus.set("expired");
        this.stopPolling();
      },
    });
  }

  approveFromMobile(token: string): Observable<{ success: boolean }> {
    return new Observable((observer) => {
      this.dataSyncProvider.invokeCommand<{ success: boolean }>("qr_approve", { token }).subscribe({
        next: (data) => {
          observer.next(data);
          observer.complete();
        },
        error: (err) => observer.error(err),
      });
    });
  }

  clearQrData(): void {
    this.stopPolling();
    this.currentQrData.set(null);
    this.qrStatus.set("pending");
    this.qrStatusData.set(null);
  }
}
