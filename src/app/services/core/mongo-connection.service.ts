/* sys lib */
import { Injectable, signal, inject } from "@angular/core";
import { Observable, of, throwError } from "rxjs";
import { tap, catchError, map, switchMap } from "rxjs/operators";
import { invoke } from "@tauri-apps/api/core";

/* services */
import { NotifyService } from "@services/notifications/notify.service";
import { ResponseStatus } from "@models/response.model";

export interface ConnectionState {
  isConnected: boolean;
  lastChecked: Date | null;
  checking: boolean;
}

@Injectable({
  providedIn: "root",
})
export class MongoConnectionService {
  private notifyService = inject(NotifyService);

  private readonly connectionState = signal<ConnectionState>({
    isConnected: false,
    lastChecked: null,
    checking: false,
  });

  private readonly connectionErrorShown = signal<boolean>(false);

  readonly isConnected = () => this.connectionState().isConnected;
  readonly isChecking = () => this.connectionState().checking;
  readonly wasEverConnected = signal<boolean>(false);

  checkConnection(): Observable<boolean> {
    if (this.connectionState().checking) {
      return of(this.connectionState().isConnected);
    }

    this.connectionState.update((s) => ({ ...s, checking: true }));

    return new Observable<boolean>((subscriber) => {
      invoke<any>("check_mongodb_connection")
        .then((response) => {
          const isConnected = response.status === ResponseStatus.SUCCESS && response.data === true;

          this.connectionState.set({
            isConnected,
            lastChecked: new Date(),
            checking: false,
          });

          if (isConnected) {
            this.wasEverConnected.set(true);
            this.connectionErrorShown.set(false);
          } else if (!this.connectionErrorShown()) {
            this.connectionErrorShown.set(true);
            this.notifyService.showWarning(
              "MongoDB is not connected. Admin features may be limited."
            );
          }

          subscriber.next(isConnected);
          subscriber.complete();
        })
        .catch((error) => {
          this.connectionState.set({
            isConnected: false,
            lastChecked: new Date(),
            checking: false,
          });

          if (!this.connectionErrorShown()) {
            this.connectionErrorShown.set(true);
            this.notifyService.showError("Failed to check MongoDB connection: " + error);
          }

          subscriber.next(false);
          subscriber.complete();
        });
    });
  }

  resetConnectionState(): void {
    this.connectionState.set({
      isConnected: false,
      lastChecked: null,
      checking: false,
    });
    this.connectionErrorShown.set(false);
  }

  request<T>(operation: () => Observable<T>): Observable<T> {
    return this.checkConnection().pipe(
      switchMap((isConnected) => {
        if (!isConnected) {
          return throwError(
            () => new Error("MongoDB is not connected. Please check your connection and try again.")
          );
        }
        return operation();
      }),
      catchError((error) => {
        return throwError(() => error);
      })
    );
  }

  requestWithConnectionCheck<T>(
    operation: () => Observable<T>,
    errorMessage: string = "MongoDB operation failed"
  ): Observable<T> {
    return this.checkConnection().pipe(
      switchMap((isConnected) => {
        if (!isConnected) {
          return throwError(
            () => new Error("MongoDB is not connected. Admin features are unavailable.")
          );
        }
        return operation();
      }),
      catchError((err) => {
        const message = err.message || errorMessage;
        this.notifyService.showError(message);
        return throwError(() => new Error(message));
      })
    );
  }
}
