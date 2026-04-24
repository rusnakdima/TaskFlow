import { Injectable } from "@angular/core";
import { Subject } from "rxjs";

@Injectable({
  providedIn: "root",
})
export class ShortcutEmittersService {
  private saveSubject = new Subject<void>();
  save$ = this.saveSubject.asObservable();

  private helpSubject = new Subject<void>();
  help$ = this.helpSubject.asObservable();

  private closeSubject = new Subject<void>();
  close$ = this.closeSubject.asObservable();

  private syncSubject = new Subject<void>();
  sync$ = this.syncSubject.asObservable();

  private refreshSubject = new Subject<void>();
  refresh$ = this.refreshSubject.asObservable();

  emitSave(): void {
    this.saveSubject.next();
  }

  emitHelp(): void {
    this.helpSubject.next();
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
}
