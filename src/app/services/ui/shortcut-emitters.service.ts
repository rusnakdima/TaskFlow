import { Injectable, signal } from "@angular/core";

import { ShortcutService } from "./shortcut.service";

@Injectable({
  providedIn: "root",
})
export class ShortcutEmittersService {
  private readonly _saveSignal = signal<number>(0);
  private readonly _closeSignal = signal<number>(0);
  private readonly _syncSignal = signal<number>(0);
  private readonly _refreshSignal = signal<number>(0);

  private _counter = 0;

  saveSignal = this._saveSignal.asReadonly();
  closeSignal = this._closeSignal.asReadonly();
  syncSignal = this._syncSignal.asReadonly();
  refreshSignal = this._refreshSignal.asReadonly();

  constructor(private shortcutService: ShortcutService) {}

  emitSave(): void {
    this._saveSignal.set(++this._counter);
  }

  emitHelp(): void {
    this.shortcutService.showHelp();
  }

  emitClose(): void {
    this._closeSignal.set(++this._counter);
  }

  emitSync(): void {
    this._syncSignal.set(++this._counter);
  }

  emitRefresh(): void {
    this._refreshSignal.set(++this._counter);
  }

  emitShortcuts(): void {
    this.shortcutService.showHelp();
  }
}
