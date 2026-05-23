import { Component, Input, Output, EventEmitter, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatMenuModule } from "@angular/material/menu";

export interface SegmentOption {
  id: string;
  label: string;
  icon?: string;
  count?: number;
}

@Component({
  selector: "app-segment-selector",
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatMenuModule],
  templateUrl: "./segment-selector.component.html",
})
export class SegmentSelectorComponent {
  @Input() options: SegmentOption[] = [];
  @Input() active = "";
  @Output() select = new EventEmitter<string>();

  showMenu = signal(false);
  isHovering = signal(false);

  getActiveOption(): SegmentOption | undefined {
    return this.options.find((o) => o.id === this.active);
  }

  onSelect(id: string): void {
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
