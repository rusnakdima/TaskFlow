import { Component, Input, signal, computed, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { PullToRefreshState } from "./pull-to-refresh.directive";

@Component({
  selector: "app-pull-to-refresh-indicator",
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./pull-to-refresh-indicator.component.html",
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
