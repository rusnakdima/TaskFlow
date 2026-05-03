import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ConfirmDialogService } from "@services/core/confirm-dialog.service";

@Component({
  selector: "app-confirm-dialog",
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (confirmService.isOpen()) {
      <div
        class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
        (click)="onBackdropClick()"
      >
        <div
          class="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-zinc-800"
          (click)="$event.stopPropagation()"
        >
          <h3 class="mb-2 text-xl font-bold text-gray-900 dark:text-gray-100">
            {{ confirmService.config()?.title }}
          </h3>
          <p class="mb-6 text-gray-600 dark:text-gray-400">
            {{ confirmService.config()?.message }}
          </p>
          <div class="flex justify-end gap-3">
            <button
              type="button"
              class="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-100 dark:border-zinc-600 dark:text-gray-300 dark:hover:bg-zinc-700"
              (click)="confirmService.resolve(false)"
            >
              {{ confirmService.config()?.cancelText || "Cancel" }}
            </button>
            <button
              type="button"
              class="rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700"
              [class]="confirmService.config()?.confirmClass || 'bg-red-600 hover:bg-red-700'"
              (click)="confirmService.resolve(true)"
            >
              {{ confirmService.config()?.confirmText || "Confirm" }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ConfirmDialogComponent {
  confirmService = inject(ConfirmDialogService);

  onBackdropClick(): void {
    this.confirmService.resolve(false);
  }
}
