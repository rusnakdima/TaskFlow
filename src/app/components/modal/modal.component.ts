import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";

@Component({
  selector: "app-modal",
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (isOpen) {
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        (click)="onBackdropClick()"
      >
        <div
          class="mx-4 w-full overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-zinc-800"
          [class.max-w-md]="size === 'md'"
          [class.max-w-sm]="size === 'sm'"
          [class.max-w-lg]="size === 'lg'"
          (click)="$event.stopPropagation()"
        >
          <div
            class="flex items-center justify-between border-b border-slate-200 p-4 dark:border-zinc-700"
          >
            <h3 class="font-bold text-slate-800 dark:text-zinc-200">{{ title }}</h3>
            <button
              (click)="close()"
              class="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-zinc-500 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
            >
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                ></path>
              </svg>
            </button>
          </div>
          <div class="p-4">
            <ng-content></ng-content>
          </div>
          @if (showFooter) {
            <div
              class="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50"
            >
              <ng-content select="[modal-footer]"></ng-content>
            </div>
          }
        </div>
      </div>
    }
  `,
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
