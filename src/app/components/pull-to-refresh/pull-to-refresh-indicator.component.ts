import { Component, Input, signal, computed, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { PullToRefreshState } from "./pull-to-refresh.directive";

@Component({
  selector: "app-pull-to-refresh-indicator",
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pull-to-refresh-indicator pointer-events-none">
      @if (isVisible()) {
        <div
          class="fixed right-0 left-0 z-50 flex items-center justify-center"
          [style.transform]="transformStyle()"
          [style.opacity]="opacityStyle()"
        >
          <div class="rounded-full p-3 shadow-lg" [style.background-color]="'var(--accent-color)'">
            @if (state() === "refreshing") {
              <svg
                class="h-6 w-6 animate-spin text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  class="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  stroke-width="4"
                ></circle>
                <path
                  class="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            } @else {
              <svg
                class="h-6 w-6 text-white transition-transform duration-200"
                [class.rotate-180]="state() === 'triggered'"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 14l-7 7m0 0l-7-7m7 7V3"
                />
              </svg>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .pull-to-refresh-indicator {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 9999;
        pointer-events: none;
      }
    `,
  ],
})
export class PullToRefreshIndicatorComponent {
  @Input() state = signal<PullToRefreshState>("idle");
  @Input() pullDistance = signal(0);

  isVisible = computed(() => this.state() !== "idle");

  transformStyle = computed(() => {
    const dist = Math.min(this.pullDistance(), 80);
    return `translateY(${dist}px)`;
  });

  opacityStyle = computed(() => {
    const s = this.state();
    if (s === "refreshing" || s === "complete") {
      return "1";
    }
    const dist = this.pullDistance();
    if (dist < 20) return "0";
    return Math.min((dist - 20) / 60, 1).toString();
  });
}
