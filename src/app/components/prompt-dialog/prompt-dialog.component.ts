import { Component, inject, signal, ViewChild, ElementRef, effect } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { PromptDialogService } from "@services/core/prompt-dialog.service";
import { AppButtonComponent } from "@components/shared/button/button.component";

@Component({
  selector: "app-prompt-dialog",
  standalone: true,
  imports: [CommonModule, FormsModule, AppButtonComponent],
  templateUrl: "./prompt-dialog.component.html",
})
export class PromptDialogComponent {
  @ViewChild("inputField") inputField!: ElementRef<HTMLInputElement>;

  promptService = inject(PromptDialogService);
  inputValue = "";
  inputError = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (this.promptService.isOpen()) {
        setTimeout(() => {
          this.inputField?.nativeElement?.focus();
        }, 100);
      }
    });
  }

  onBackdropClick(): void {
    this.promptService.resolve(null);
  }

  onCancel(): void {
    this.promptService.resolve(null);
  }

  onConfirm(): void {
    const config = this.promptService.config();
    const value = this.inputValue;

    if (config?.required && !value.trim()) {
      this.inputError.set("This field is required");
      return;
    }

    if (config?.validateFn) {
      const error = config.validateFn(value);
      if (error) {
        this.inputError.set(error);
        return;
      }
    }

    this.promptService.resolve(value);
    this.inputValue = "";
    this.inputError.set(null);
  }

  clearError(): void {
    this.inputError.set(null);
  }
}
