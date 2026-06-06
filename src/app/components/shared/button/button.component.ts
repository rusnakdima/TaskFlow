import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";

export type ButtonVariant = "accent" | "cancel" | "danger" | "warning" | "success";
export type ButtonSize = "sm" | "md" | "lg";

@Component({
  selector: "app-button",
  standalone: true,
  imports: [CommonModule, MatIconModule, MatProgressSpinnerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./button.component.html",
  styleUrl: "./button.styles.css",
})
export class AppButtonComponent {
  @Input() variant: ButtonVariant = "accent";
  @Input() size: ButtonSize = "md";
  @Input() disabled: boolean = false;
  @Input() loading: boolean = false;
  @Input() icon: string = "";
  @Input() iconPosition: "left" | "right" = "left";
  @Input() fullWidth: boolean = false;
  @Input() type: "button" | "submit" | "reset" = "button";

  @Output() clicked = new EventEmitter<MouseEvent>();

  get buttonClass(): string {
    const classes = ["app-btn", `app-btn--${this.variant}`, `app-btn--${this.size}`];
    if (this.fullWidth) classes.push("app-btn--full");
    if (this.disabled || this.loading) classes.push("app-btn--disabled");
    return classes.join(" ");
  }

  get showSpinner(): boolean {
    return this.loading;
  }

  onClick(event: MouseEvent): void {
    if (!this.disabled && !this.loading) {
      this.clicked.emit(event);
    }
  }
}
