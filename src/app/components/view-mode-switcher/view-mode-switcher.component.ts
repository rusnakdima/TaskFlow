/* sys lib */
import { CommonModule } from "@angular/common";
import {
  Component,
  EventEmitter,
  Input,
  Output,
  ChangeDetectionStrategy,
  OnInit,
} from "@angular/core";

/* materials */
import { MatIconModule } from "@angular/material/icon";

export type ViewMode = "card" | "grid" | "table";

@Component({
  selector: "app-view-mode-switcher",
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: "./view-mode-switcher.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewModeSwitcherComponent implements OnInit {
  @Input() mode: ViewMode = "grid";
  @Input() pageKey: string = "default";
  @Output() modeChange = new EventEmitter<ViewMode>();

  private get STORAGE_KEY(): string {
    return `view-mode-${this.pageKey}`;
  }

  setMode(newMode: ViewMode): void {
    this.modeChange.emit(newMode);
    this.savePreference(newMode);
  }

  loadPreference(): ViewMode {
    if (typeof window === "undefined") return "card";
    const saved = localStorage.getItem(this.STORAGE_KEY);
    return (saved as ViewMode) || "card";
  }

  savePreference(mode: ViewMode): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(this.STORAGE_KEY, mode);
  }

  ngOnInit(): void {
    const saved = this.loadPreference();
    if (saved !== this.mode) {
      this.modeChange.emit(saved);
    }
  }
}
