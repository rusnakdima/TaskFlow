import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";

@Component({
  selector: "app-overlay-dropdown",
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (isOpen) {
      <div class="fixed inset-0 z-40" (click)="onBackdropClick()"></div>
      <div
        class="absolute z-50 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-800"
        [class]="widthClass"
        [style.left.px]="left"
        [style.top.px]="top"
      >
        <ng-content></ng-content>
      </div>
    }
  `,
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
