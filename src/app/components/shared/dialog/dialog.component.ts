import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";

export type DialogSize = "sm" | "md" | "lg" | "xl";

@Component({
  selector: "app-dialog",
  standalone: true,
  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./dialog.component.html",
  styleUrl: "./dialog.styles.css",
})
export class AppDialogComponent {
  @Input() show: boolean = false;
  @Input() title: string = "";
  @Input() size: DialogSize = "md";
  @Input() zIndex: number = 9999;
  @Input() backdropClose: boolean = true;
  @Input() showClose: boolean = true;
  @Input() showHeader: boolean = true;

  @Output() closed = new EventEmitter<void>();

  get maxWidth(): string {
    switch (this.size) {
      case "sm":
        return "320px";
      case "md":
        return "480px";
      case "lg":
        return "640px";
      case "xl":
        return "800px";
      default:
        return "480px";
    }
  }

  get dialogStyle(): any {
    return {
      "max-width": this.maxWidth,
      "z-index": this.zIndex,
    };
  }

  onBackdropClick(): void {
    if (this.backdropClose) {
      this.close();
    }
  }

  onCloseClick(): void {
    this.close();
  }

  private close(): void {
    this.show = false;
    this.closed.emit();
  }
}
