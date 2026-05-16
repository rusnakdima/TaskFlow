import {
  Directive,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  Output,
  inject,
  signal,
} from "@angular/core";

export type PullToRefreshState = "idle" | "pulling" | "triggered" | "refreshing" | "complete";

@Directive({
  selector: "[appPullToRefresh]",
  standalone: true,
})
export class PullToRefreshDirective implements OnInit, OnDestroy {
  @Input() pullToRefreshHandler: (() => void | Promise<void>) | null = null;
  @Input() pullToRefreshDisabled = false;

  @Output() stateChange = new EventEmitter<PullToRefreshState>();
  @Output() distanceChange = new EventEmitter<number>();

  state = signal<PullToRefreshState>("idle");
  pullDistance = signal(0);

  private el = inject(ElementRef);
  private touchStartY = 0;
  private touchStartX = 0;
  private isPulling = false;

  private lastDeltaY = 0;
  private lastDeltaTime = 0;
  private hasPassedMinThreshold = false;

  private readonly THRESHOLD = 80;
  private readonly MIN_MOVEMENT = 30;
  private readonly MAX_PULL = 150;
  private readonly COOLDOWN_MS = 500;
  private readonly VELOCITY_THRESHOLD = 0.5;

  private lastRefreshTime = 0;

  ngOnInit(): void {}

  ngOnDestroy(): void {}

  @HostListener("touchstart", ["$event"])
  onTouchStart(event: TouchEvent): void {
    if (this.pullToRefreshDisabled || this.state() === "refreshing") return;
    if (this.el.nativeElement.scrollTop > 0) return;

    const touch = event.touches[0];
    this.touchStartY = touch.clientY;
    this.touchStartX = touch.clientX;
    this.isPulling = false;
    this.hasPassedMinThreshold = false;
    this.lastDeltaY = 0;
    this.lastDeltaTime = Date.now();
  }

  @HostListener("touchmove", ["$event"])
  onTouchMove(event: TouchEvent): void {
    if (this.pullToRefreshDisabled || this.state() === "refreshing") return;
    if (this.el.nativeElement.scrollTop > 0) return;

    if (Date.now() - this.lastRefreshTime < this.COOLDOWN_MS) return;

    const touch = event.touches[0];
    const deltaY = touch.clientY - this.touchStartY;
    const deltaX = touch.clientX - this.touchStartX;

    if (deltaX > 30 && Math.abs(deltaY) < Math.abs(deltaX)) {
      return;
    }

    const now = Date.now();
    const dt = now - this.lastDeltaTime;
    const instantaneousVelocity = dt > 0 ? Math.abs(deltaY - this.lastDeltaY) / dt : 0;

    const distance = Math.min(Math.abs(deltaY), this.MAX_PULL);

    if (!this.hasPassedMinThreshold && distance > this.MIN_MOVEMENT) {
      this.hasPassedMinThreshold = true;
    }

    const isSlowScroll = instantaneousVelocity < this.VELOCITY_THRESHOLD;
    const distanceThreshold = isSlowScroll ? this.THRESHOLD : this.THRESHOLD;

    if (
      deltaY > 0 &&
      this.hasPassedMinThreshold &&
      distance >= distanceThreshold &&
      !this.isPulling
    ) {
      this.isPulling = true;
      this.triggerHaptic();
      this.triggerRefresh();
      this.lastRefreshTime = Date.now();
      return;
    }

    if (distance >= this.MIN_MOVEMENT && this.state() !== "idle") {
      this.pullDistance.set(distance);
      this.distanceChange.emit(distance);

      const newState: PullToRefreshState = distance >= this.THRESHOLD ? "triggered" : "pulling";
      if (this.state() !== newState) {
        this.state.set(newState);
        this.stateChange.emit(newState);
      }
    }

    this.lastDeltaY = deltaY;
    this.lastDeltaTime = now;
  }

  @HostListener("touchend")
  onTouchEnd(): void {
    if (this.pullToRefreshDisabled) return;

    if (this.isPulling || this.pullDistance() >= this.THRESHOLD) {
      if (this.pullDistance() >= this.THRESHOLD) {
        this.triggerRefresh();
      } else {
        this.reset();
      }
    }

    this.isPulling = false;
  }

  @HostListener("touchcancel")
  onTouchCancel(): void {
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
