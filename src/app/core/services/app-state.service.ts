import { Injectable, signal } from "@angular/core";

@Injectable({
  providedIn: "root",
})
export class AppStateService {
  showInfoBlock = signal(false);

  toggleInfoBlock() {
    this.showInfoBlock.update((v) => !v);
  }

  setShowInfoBlock(show: boolean) {
    this.showInfoBlock.set(show);
  }
}
