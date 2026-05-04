import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";

@Component({
  selector: "app-filter-sidebar",
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule],
  templateUrl: "./filter-sidebar.component.html",
  styleUrls: ["./filter-sidebar.component.scss"],
})
export class FilterSidebarComponent {
  @Input() isOpen = false;
  @Input() title = "Filters";

  @Output() closeEvent = new EventEmitter<void>();
  @Output() clearEvent = new EventEmitter<void>();
  @Output() applyEvent = new EventEmitter<void>();

  close(): void {
    this.closeEvent.emit();
  }

  clearAll(): void {
    this.clearEvent.emit();
  }

  apply(): void {
    this.applyEvent.emit();
  }
}
