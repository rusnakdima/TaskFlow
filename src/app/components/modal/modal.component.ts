import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
@Component({
  selector: "app-modal",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./modal.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalComponent {
  @Input() isOpen: boolean = false;
  @Input() title: string = "";
  @Input() size: "sm" | "md" | "lg" = "md";
  @Input() showFooter: boolean = true;
  @Input() closeOnBackdrop: boolean = true;
  @Output() closed = new EventEmitter<void>();
  close(): void {
    this.isOpen = false;
    this.closed.emit();
  }
  onBackdropClick(): void {
    if (this.closeOnBackdrop) {
      this.close();
    }
  }
}
