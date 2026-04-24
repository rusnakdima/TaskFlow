/* sys lib */
import { Injectable } from "@angular/core";

@Injectable({
  providedIn: "root",
})
export class ConflictResolutionService {
  resolveConflict<T extends { updatedAt: string }>(local: T, remote: T): T {
    const localTime = new Date(local.updatedAt).getTime();
    const remoteTime = new Date(remote.updatedAt).getTime();
    return remoteTime > localTime ? remote : local;
  }

  async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000
  ): Promise<T> {
    let lastError: Error | null = null;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        if (i < maxRetries - 1) {
          await this.sleep(Math.pow(2, i) * delayMs);
        }
      }
    }
    throw lastError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
