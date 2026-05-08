import { Component, inject, signal, ViewChild, ElementRef, effect } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { PromptDialogService } from "@services/core/prompt-dialog.service";

@Component({
  selector: "app-prompt-dialog",
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (promptService.isOpen()) {
      <div
        class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
        (click)="onBackdropClick()"
      >
        <div
          class="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-zinc-800"
          (click)="$event.stopPropagation()"
        >
          <h3 class="mb-2 text-xl font-bold text-gray-900 dark:text-gray-100">
            {{ promptService.config()?.title }}
          </h3>
          <p class="mb-4 text-gray-600 dark:text-gray-400">
            {{ promptService.config()?.message }}
          </p>
          <input
            #inputField
            type="text"
            [(ngModel)]="inputValue"
            [class]="inputError() ? 'border-red-500' : 'border-gray-300 dark:border-zinc-600'"
            class="mb-1 w-full rounded-lg border px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none dark:bg-zinc-700 dark:text-gray-100"
            [placeholder]="promptService.config()?.defaultValue || ''"
            (keydown.enter)="onConfirm()"
            (keydown.escape)="onCancel()"
            (input)="clearError()"
          />
          @if (inputError()) {
            <p class="mb-3 text-sm text-red-500">{{ inputError() }}</p>
          }
          <div class="flex justify-end gap-3">
            <button
              type="button"
              class="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-100 dark:border-zinc-600 dark:text-gray-300 dark:hover:bg-zinc-700"
              (click)="onCancel()"
            >
              {{ promptService.config()?.cancelText || "Cancel" }}
            </button>
            <button
              type="button"
              class="rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
              [class]="promptService.config()?.confirmClass || 'bg-blue-600 hover:bg-blue-700'"
              (click)="onConfirm()"
            >
              {{ promptService.config()?.confirmText || "OK" }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
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
