import { inject, Injectable, signal } from "@angular/core";
import { BehaviorSubject, Observable } from "rxjs";

@Injectable({
  providedIn: "root",
})
export class WebSocketConnectionService {
  private socket: WebSocket | null = null;
  private url = "ws://127.0.0.1:8766";
  private isConnected$ = new BehaviorSubject<boolean>(false);

  readonly connectionStatus = signal<boolean>(false);

  connect(): void {
    try {
      this.socket = new WebSocket(this.url);

      this.socket.onopen = () => {
        this.isConnected$.next(true);
        this.connectionStatus.set(true);
      };

      this.socket.onclose = () => {
        this.isConnected$.next(false);
        this.connectionStatus.set(false);
      };

      this.socket.onerror = () => {
        this.isConnected$.next(false);
        this.connectionStatus.set(false);
      };
    } catch (error) {
      this.isConnected$.next(false);
      this.connectionStatus.set(false);
    }
  }

  notifyConnected(connected: boolean): void {
    this.isConnected$.next(connected);
    this.connectionStatus.set(connected);
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  isConnected(): boolean {
    return this.isConnected$.value;
  }

  getConnectionStatus(): Observable<boolean> {
    return this.isConnected$.asObservable();
  }

  getSocket(): WebSocket | null {
    return this.socket;
  }
}
