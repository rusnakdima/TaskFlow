/**
 * @deprecated Use SegmentSelectorComponent instead.
 * This component will be removed in a future version.
 */
import { Component, Input, Output, EventEmitter, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatMenuModule } from "@angular/material/menu";
import { ViewMode } from "@entities/view-mode.model";

export interface ViewModeTab {
  id: ViewMode;
  label: string;
  icon?: string;
}

@Component({
  selector: "app-view-mode-tabs",
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatMenuModule],
  templateUrl: "./view-mode-tabs.component.html",
})
export class ViewModeTabsComponent {
  @Input() options: ViewModeTab[] = [];
  @Input() active: ViewMode = "card";
  @Output() select = new EventEmitter<ViewMode>();

  isHovering = signal(false);

  getActiveOption(): ViewModeTab | undefined {
    return this.options.find((o) => o.id === this.active);
  }

  onSelect(id: ViewMode): void {
    this.select.emit(id);
  }

  onMouseEnter(): void {
    this.isHovering.set(true);
  }

  onMouseLeave(): void {
    this.isHovering.set(false);
  }

  onWheel(event: WheelEvent): void {
    if (!this.isHovering() || this.options.length === 0) return;
    event.preventDefault();
    const direction = event.deltaY > 0 ? 1 : -1;
    const currentIndex = this.options.findIndex((o) => o.id === this.active);
    const nextIndex = (currentIndex + direction + this.options.length) % this.options.length;
    this.select.emit(this.options[nextIndex].id);
  }
}
