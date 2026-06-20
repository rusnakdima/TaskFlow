/* sys lib */
import { Component, Input, Output, EventEmitter } from "@angular/core";
import { CommonModule } from "@angular/common";
@Component({
  selector: "app-modal-dialog",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./modal-dialog.component.html",
})
export class ModalDialogComponent {
  @Input() title: string = "";
  @Input() showClose: boolean = true;
  @Input() size: "sm" | "md" | "lg" = "md";
  @Input() isOpen: boolean = false;
  @Output() closed = new EventEmitter<void>();
  get sizeClasses(): string {
    switch (this.size) {
      case "sm":
        return "max-w-sm";
      case "lg":
        return "max-w-2xl";
      case "md":
      default:
        return "max-w-md";
    }
  }
  onBackdropClick(): void {
    this.close();
  }
  close(): void {
    this.isOpen = false;
    this.closed.emit();
  }
}
