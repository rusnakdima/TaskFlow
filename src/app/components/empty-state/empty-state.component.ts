import { Component, Input, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { MatIconModule } from "@angular/material/icon";

@Component({
  selector: "app-empty-state",
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  template: `
    <div
      class="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
    >
      @if (icon) {
        <div class="mb-4 inline-flex rounded-full bg-gray-100 p-8 dark:bg-zinc-700/50">
          <mat-icon class="size-16! min-w-16 text-6xl!" [fontIcon]="icon" />
        </div>
      }
      <h3 class="textNormal mb-2 text-xl font-semibold">{{ title }}</h3>
      @if (message) {
        <p class="textMuted">{{ message }}</p>
      }
      @if (actionLabel && actionLink) {
        <a
          [routerLink]="actionLink"
          class="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
        >
          {{ actionLabel }}
        </a>
      } @else if (actionLabel) {
        <button
          class="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
          (click)="onAction()"
        >
          {{ actionLabel }}
        </button>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateComponent {
  @Input() icon = "inbox";
  @Input() title = "Nothing here yet";
  @Input() message?: string;
  @Input() actionLabel?: string;
  @Input() actionLink?: string;
  @Input() actionCallback?: () => void;

  onAction(): void {
    this.actionCallback?.();
  }
}
