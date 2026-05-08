import { Injectable, signal, computed } from "@angular/core";

export interface PromptDialogConfig {
  title: string;
  message: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  confirmClass?: string;
  required?: boolean;
  validateFn?: (value: string) => string | null;
}

@Injectable({
  providedIn: "root",
})
export class PromptDialogService {
  private _isOpen = signal(false);
  private _config = signal<PromptDialogConfig | null>(null);
  private _resultResolver = signal<((result: string | null) => void) | null>(null);

  isOpen = computed(() => this._isOpen());
  config = computed(() => this._config());

  prompt(config: PromptDialogConfig): Promise<string | null> {
    this._config.set(config);
    this._isOpen.set(true);

    return new Promise((resolve) => {
      this._resultResolver.set(resolve);
    });
  }

  resolve(result: string | null): void {
    const resolver = this._resultResolver();
    if (resolver) {
      resolver(result);
    }
    this._isOpen.set(false);
    this._config.set(null);
    this._resultResolver.set(null);
  }

  confirmAction(result: string | null): void {
    this.resolve(result);
  }
}
