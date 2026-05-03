import { Injectable, signal, computed } from "@angular/core";

export interface ConfirmDialogConfig {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmClass?: string;
}

@Injectable({
  providedIn: "root",
})
export class ConfirmDialogService {
  private _isOpen = signal(false);
  private _config = signal<ConfirmDialogConfig | null>(null);
  private _resultResolver = signal<((result: boolean) => void) | null>(null);

  isOpen = computed(() => this._isOpen());
  config = computed(() => this._config());

  confirm(config: ConfirmDialogConfig): Promise<boolean> {
    this._config.set(config);
    this._isOpen.set(true);

    return new Promise((resolve) => {
      this._resultResolver.set(resolve);
    });
  }

  resolve(result: boolean): void {
    const resolver = this._resultResolver();
    if (resolver) {
      resolver(result);
    }
    this._isOpen.set(false);
    this._config.set(null);
    this._resultResolver.set(null);
  }

  confirmAction(result: boolean): void {
    this.resolve(result);
  }
}
