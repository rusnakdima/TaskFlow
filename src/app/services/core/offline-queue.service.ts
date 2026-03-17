/* sys lib */
import { Injectable } from "@angular/core";
import { Observable, of } from "rxjs";

/**
 * OfflineQueueService - DISABLED
 * The offline queuing logic has been disabled as per optimization plan.
 */
@Injectable({
  providedIn: "root",
})
export class OfflineQueueService {
  constructor() {}

  setExecuteFunction(fn: any): void {
    // Disabled
  }

  isOnline$(): Observable<boolean> {
    return of(true);
  }

  isOnline(): boolean {
    return true;
  }

  isProcessing$(): Observable<boolean> {
    return of(false);
  }

  queueSize$(): Observable<number> {
    return of(0);
  }

  getQueueSize(): number {
    return 0;
  }

  getQueuedOperations(): any[] {
    return [];
  }

  getPendingCount(): number {
    return 0;
  }

  enqueue(operation: any): string {
    return "";
  }

  remove(operationId: string): void {
    // Disabled
  }

  clear(): void {
    // Disabled
  }

  triggerSync(): void {
    // Disabled
  }
}
