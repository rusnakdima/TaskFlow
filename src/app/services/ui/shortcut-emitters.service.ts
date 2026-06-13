import { Injectable, signal } from "@angular/core";

import { ShortcutService } from "./shortcut.service";

@Injectable({
  providedIn: "root",
})
export class ShortcutEmittersService {
  private readonly _saveSignal = signal<void>(undefined);
  private readonly _closeSignal = signal<void>(undefined);
  private readonly _syncSignal = signal<void>(undefined);
  private readonly _refreshSignal = signal<void>(undefined);

  saveSignal = this._saveSignal.asReadonly();
  closeSignal = this._closeSignal.asReadonly();
  syncSignal = this._syncSignal.asReadonly();
  refreshSignal = this._refreshSignal.asReadonly();

  constructor(private shortcutService: ShortcutService) {}

  emitSave(): void {
    this._saveSignal.set(undefined);
  }

  emitHelp(): void {
    this.shortcutService.showHelp();
  }

  emitClose(): void {
    this._closeSignal.set(undefined);
  }

  emitSync(): void {
    this._syncSignal.set(undefined);
  }

  emitRefresh(): void {
    this._refreshSignal.set(undefined);
  }

  emitShortcuts(): void {
    this.shortcutService.showHelp();
  }
}
