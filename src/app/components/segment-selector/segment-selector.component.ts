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

  getActiveOption(): SegmentOption | undefined {
    return this.options.find((o) => o.id === this.active);
  }

  onSelect(id: string): void {
    this.select.emit(id);
  }
}
