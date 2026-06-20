import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
@Component({
  selector: "app-overlay-dropdown",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./overlay-dropdown.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverlayDropdownComponent {
  @Input() isOpen: boolean = false;
  @Input() left: number = 0;
  @Input() top: number = 0;
  @Input() widthClass: string = "w-56";
  @Input() closeOnBackdrop: boolean = true;
  @Output() closed = new EventEmitter<void>();
  onBackdropClick(): void {
    if (this.closeOnBackdrop) {
      this.closed.emit();
    }
  }
}
