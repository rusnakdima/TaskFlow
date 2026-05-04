import { Injectable, signal } from "@angular/core";
import { ViewMode } from "@models/view-mode.model";

@Injectable({ providedIn: "root" })
export class ViewModeService {
  private modeSignal = signal<ViewMode>("grid");

  readonly mode = this.modeSignal.asReadonly();

  loadPreference(pageKey: string): ViewMode {
    if (typeof window === "undefined") return "card";
    const saved = localStorage.getItem(`view-mode-${pageKey}`);
    return (saved as ViewMode) || "card";
  }

  savePreference(pageKey: string, mode: ViewMode): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(`view-mode-${pageKey}`, mode);
  }

  setMode(mode: ViewMode): void {
    this.modeSignal.set(mode);
  }
}
