/* sys lib */
import { Component, Input, computed, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
@Component({
  selector: "app-progress-compute",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./progress-compute.component.html",
})
export class ProgressComputeComponent {
  @Input() set completed(count: number) {
    this._completed.set(count);
  }
  @Input() set total(count: number) {
    this._total.set(count);
  }
  @Input() set percentageMode(value: boolean) {
    this._percentageMode.set(value);
  }
  private _completed = signal(0);
  private _total = signal(0);
  private _percentageMode = signal(false);
  progress = computed(() => {
    const total = this._total();
    const completed = this._completed();
    if (this._percentageMode()) {
      if (total === 0) return "0%";
      return Math.round((completed / total) * 100) + "%";
    }
    return `${completed}/${total}`;
  });
}
