import { Injectable, inject, signal, OnDestroy } from "@angular/core";
import { interval, Subscription, Observable, Subject } from "rxjs";
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { REQUEST_SERVICE } from "@services/api.service";
import { QrStatus, QrCodeData, QrGenerationResult, QrStatusResult } from "@models/security.model";

@Injectable({
  providedIn: "root",
})
export class QrLoginService implements OnDestroy {
  private requestService = inject(REQUEST_SERVICE);
  private jwtTokenService = inject(JwtTokenService);

  private pollSubscription: Subscription | null = null;
  private readonly qrApprovedSubject = new Subject<string>();

  readonly qrApproved$ = this.qrApprovedSubject.asObservable();

  readonly currentQrData = signal<QrCodeData | null>(null);
  readonly qrStatus = signal<QrStatus>("pending");
  readonly qrStatusData = signal<QrStatusResult | null>(null);
  readonly isPolling = signal(false);

  ngOnDestroy(): void {
    this.stopPolling();
  }

  generateQrCode(_username?: string): Observable<QrGenerationResult> {
    return new Observable((observer) => {
      this.requestService.invokeCommand<any>("qr_generate", {}).subscribe({
        next: (response) => {
          const data = response?.data;
          this.currentQrData.set({
            token: data?.token,
            qrCode: data?.qrCode,
            expiresAt: data?.expiresAt,
          });
          this.qrStatus.set("pending");
          observer.next({
            success: true,
            token: data?.token,
            qrCode: data?.qrCode,
            expiresAt: data?.expiresAt,
          });
          observer.complete();
        },
        error: (err) => observer.error(err),
      });
    });
  }

  generateQrCodeForDesktopLogin(username: string): Observable<QrGenerationResult> {
    const userId = this.jwtTokenService.getCurrentUserId() || "";
    return new Observable((observer) => {
      this.requestService
        .invokeCommand<any>("qr_generate_for_desktop", { username, user_id: userId })
        .subscribe({
          next: (response) => {
            const data = response?.data;
            this.currentQrData.set({
              token: data?.token,
              qrCode: data?.qrCode,
              expiresAt: data?.expiresAt,
              username,
            });
            this.qrStatus.set("approved");
            observer.next({
              success: true,
              token: data?.token,
              qrCode: data?.qrCode,
              expiresAt: data?.expiresAt,
            });
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
    this.requestService.invokeCommand<QrStatusResult>("qr_status", { token }).subscribe({
      next: (data) => {
        this.qrStatus.set(data.status);
        this.qrStatusData.set(data);

        if (data.status === "approved") {
          this.stopPolling();
          this.qrApprovedSubject.next(token);
        } else if (data.status === "expired") {
          this.stopPolling();
          this.qrApprovedSubject.error(new Error("QR code expired"));
        }
      },
      error: () => {
        this.qrStatus.set("expired");
        this.stopPolling();
        this.qrApprovedSubject.error(new Error("Failed to check QR status"));
      },
    });
  }

  approveFromMobile(token: string): Observable<{ success: boolean }> {
    return new Observable((observer) => {
      this.requestService.invokeCommand<{ success: boolean }>("qr_approve", { token }).subscribe({
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
