import { Directive, EventEmitter, HostListener, Input, Output, signal } from "@angular/core";
export type PullToRefreshState = "idle" | "pulling" | "triggered" | "refreshing" | "complete";
@Directive({
  selector: "[appPullToRefresh]",
  standalone: true,
})
export class PullToRefreshDirective {
  @Input() pullToRefreshHandler: (() => void | Promise<void>) | null = null;
  @Input() pullToRefreshDisabled = false;
  @Output() stateChange = new EventEmitter<PullToRefreshState>();
  @Output() distanceChange = new EventEmitter<number>();
  state = signal<PullToRefreshState>("idle");
  pullDistance = signal(0);
  private touchStartY = 0;
  private touchStartX = 0;
  private isPulling = false;
  private isPastTop = false;
  private hasPassedMinThreshold = false;
  private readonly THRESHOLD = 150;
  private readonly MIN_MOVEMENT = 30;
  private readonly MAX_PULL = 200;
  private readonly COOLDOWN_MS = 500;
  private lastRefreshTime = 0;
  @HostListener("touchstart", ["$event"])
  onTouchStart(event: TouchEvent): void {
    if (this.pullToRefreshDisabled || this.state() === "refreshing") return;
    const touch = event.touches[0];
    this.touchStartY = touch.clientY;
    this.touchStartX = touch.clientX;
    this.isPulling = false;
    this.isPastTop = false;
    this.hasPassedMinThreshold = false;
  }
  @HostListener("touchmove", ["$event"])
  onTouchMove(event: TouchEvent): void {
    if (this.pullToRefreshDisabled || this.state() === "refreshing") return;
    const touch = event.touches[0];
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const deltaY = touch.clientY - this.touchStartY;
    if (scrollTop <= 30 && deltaY > 0 && !this.isPastTop) {
      this.isPastTop = true;
      this.touchStartY = touch.clientY;
      this.hasPassedMinThreshold = false;
    }
    if (!this.isPastTop) return;
    if (Date.now() - this.lastRefreshTime < this.COOLDOWN_MS) return;
    const deltaX = touch.clientX - this.touchStartX;
    if (deltaX > 30 && Math.abs(deltaY) < Math.abs(deltaX)) {
      return;
    }
    const distance = Math.min(Math.abs(deltaY), this.MAX_PULL);
    if (!this.hasPassedMinThreshold && distance > this.MIN_MOVEMENT) {
      this.hasPassedMinThreshold = true;
    }
    if (this.hasPassedMinThreshold && distance >= this.THRESHOLD && !this.isPulling) {
      this.isPulling = true;
      this.triggerHaptic();
      this.triggerRefresh();
      this.lastRefreshTime = Date.now();
    }
    this.pullDistance.set(distance);
    this.distanceChange.emit(distance);
    const newState: PullToRefreshState = distance >= this.THRESHOLD ? "triggered" : "pulling";
    if (this.state() !== newState) {
      this.state.set(newState);
      this.stateChange.emit(newState);
    }
  }
  @HostListener("touchend")
  onTouchEnd(): void {
    this.isPastTop = false;
    this.isPulling = false;
  }
  @HostListener("touchcancel")
  onTouchCancel(): void {
    this.isPastTop = false;
    this.reset();
  }
  private triggerHaptic(): void {
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  }
  private triggerRefresh(): void {
    this.state.set("refreshing");
    this.stateChange.emit("refreshing");
    const handler = this.pullToRefreshHandler;
    if (!handler) {
      this.completeRefresh();
      return;
    }
    const result = handler();
    if (result && typeof result === "object" && "then" in result) {
      (result as Promise<void>).finally(() => {
        this.completeRefresh();
      });
    } else {
      setTimeout(() => this.completeRefresh(), 1000);
    }
  }
  private completeRefresh(): void {
    this.state.set("complete");
    this.stateChange.emit("complete");
    setTimeout(() => {
      this.state.set("idle");
      this.stateChange.emit("idle");
      this.pullDistance.set(0);
      this.distanceChange.emit(0);
    }, 300);
  }
  private reset(): void {
    this.state.set("idle");
    this.stateChange.emit("idle");
    this.pullDistance.set(0);
    this.distanceChange.emit(0);
  }
}
