/* sys lib */
import { CommonModule } from "@angular/common";
import {
  Component,
  EventEmitter,
  Input,
  Output,
  ChangeDetectionStrategy,
  OnInit,
  signal,
} from "@angular/core";
/* materials */
import { MatIconModule } from "@angular/material/icon";
export type ViewMode = "card" | "grid" | "table" | "list" | "kanban";
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
  @Input() modes?: ViewMode[];
  @Output() modeChange = new EventEmitter<ViewMode>();
  isHovering = signal(false);
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
  isModeAvailable(mode: ViewMode): boolean {
    if (!this.modes || this.modes.length === 0) {
      return mode !== "kanban";
    }
    return this.modes.includes(mode);
  }
  onMouseEnter(): void {
    this.isHovering.set(true);
  }
  onMouseLeave(): void {
    this.isHovering.set(false);
  }
  onWheel(event: WheelEvent): void {
    if (!this.isHovering()) return;
    event.preventDefault();
    const availableModes = (this.modes || ["card", "grid", "table"]).filter((m) =>
      this.isModeAvailable(m)
    );
    if (availableModes.length === 0) return;
    const currentIndex = availableModes.indexOf(this.mode);
    const direction = event.deltaY > 0 ? 1 : -1;
    const nextIndex = (currentIndex + direction + availableModes.length) % availableModes.length;
    this.setMode(availableModes[nextIndex]);
  }
  ngOnInit(): void {
    const saved = this.loadPreference();
    if (saved !== this.mode && this.isModeAvailable(saved)) {
      this.modeChange.emit(saved);
    } else if (!this.isModeAvailable(this.mode)) {
      const availableModes = this.modes || ["card", "grid", "table"];
      if (availableModes.length > 0) {
        this.modeChange.emit(availableModes[0]);
      }
    }
  }
}
