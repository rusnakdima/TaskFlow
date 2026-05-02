import { Injectable } from "@angular/core";
import { Subject } from "rxjs";

import { ShortcutService } from "./shortcut.service";

@Injectable({
  providedIn: "root",
})
export class ShortcutEmittersService {
  private saveSubject = new Subject<void>();
  save$ = this.saveSubject.asObservable();

  private closeSubject = new Subject<void>();
  close$ = this.closeSubject.asObservable();

  private syncSubject = new Subject<void>();
  sync$ = this.syncSubject.asObservable();

  private refreshSubject = new Subject<void>();
  refresh$ = this.refreshSubject.asObservable();

  constructor(private shortcutService: ShortcutService) {}

  emitSave(): void {
    this.saveSubject.next();
  }

  emitHelp(): void {
    this.shortcutService.showHelp();
  }

  emitClose(): void {
    this.closeSubject.next();
  }

  emitSync(): void {
    this.syncSubject.next();
  }

  emitRefresh(): void {
    this.refreshSubject.next();
  }

  emitShortcuts(): void {
    this.shortcutService.showHelp();
  }
}
