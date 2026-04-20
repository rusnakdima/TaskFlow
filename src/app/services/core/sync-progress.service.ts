/* sys lib */
import { Injectable, signal, computed } from "@angular/core";

export interface SyncProgress {
  isActive: boolean;
  operation: "visibility_change" | "import" | "export" | "sync" | null;
  progress: number;
  message: string;
  totalItems: number;
  completedItems: number;
}

@Injectable({
  providedIn: "root",
})
export class SyncProgressService {
  private isActiveSignal = signal(false);
  private operationSignal = signal<SyncProgress["operation"]>(null);
  private progressSignal = signal(0);
  private messageSignal = signal("");
  private totalItemsSignal = signal(0);
  private completedItemsSignal = signal(0);

  readonly isActive = this.isActiveSignal.asReadonly();
  readonly operation = this.operationSignal.asReadonly();
  readonly progress = this.progressSignal.asReadonly();
  readonly message = this.messageSignal.asReadonly();
  readonly totalItems = this.totalItemsSignal.asReadonly();
  readonly completedItems = this.completedItemsSignal.asReadonly();

  readonly progressPercent = computed(() => {
    if (this.totalItemsSignal() === 0) return 0;
    return Math.round((this.completedItemsSignal() / this.totalItemsSignal()) * 100);
  });

  readonly displayMessage = computed(() => {
    const msg = this.messageSignal();
    const completed = this.completedItemsSignal();
    const total = this.totalItemsSignal();
    if (total > 0) {
      return `${msg} (${completed}/${total})`;
    }
    return msg;
  });

  startSync(operation: SyncProgress["operation"], message: string, totalItems: number = 0): void {
    this.isActiveSignal.set(true);
    this.operationSignal.set(operation);
    this.messageSignal.set(message);
    this.totalItemsSignal.set(totalItems);
    this.completedItemsSignal.set(0);
    this.progressSignal.set(0);
  }

  updateProgress(completedItems: number, message?: string): void {
    this.completedItemsSignal.set(completedItems);
    if (message) {
      this.messageSignal.set(message);
    }
    this.progressSignal.set(this.progressPercent());
  }

  setMessage(message: string): void {
    this.messageSignal.set(message);
  }

  endSync(): void {
    this.isActiveSignal.set(false);
    this.operationSignal.set(null);
    this.progressSignal.set(100);
    setTimeout(() => {
      this.isActiveSignal.set(false);
      this.completedItemsSignal.set(0);
      this.totalItemsSignal.set(0);
    }, 500);
  }

  reset(): void {
    this.isActiveSignal.set(false);
    this.operationSignal.set(null);
    this.progressSignal.set(0);
    this.messageSignal.set("");
    this.totalItemsSignal.set(0);
    this.completedItemsSignal.set(0);
  }
}
