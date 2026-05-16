/* sys lib */
import { Component, Input, Output, EventEmitter } from "@angular/core";
import { CommonModule } from "@angular/common";

@Component({
  selector: "app-modal-dialog",
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (isOpen) {
      <div
        class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
        (click)="onBackdropClick()"
      >
        <div
          class="w-full rounded-xl bg-white p-6 shadow-2xl dark:bg-zinc-800"
          [ngClass]="sizeClasses"
          (click)="$event.stopPropagation()"
        >
          <div class="mb-4 flex items-center justify-between">
            <h3 class="text-xl font-bold text-gray-900 dark:text-gray-100">
              {{ title }}
            </h3>
            @if (showClose) {
              <button
                type="button"
                class="text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
                (click)="close()"
              >
                <span class="text-2xl">&times;</span>
              </button>
            }
          </div>
          <ng-content />
        </div>
      </div>
    }
  `,
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
