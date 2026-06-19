/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnDestroy, OnInit } from "@angular/core";
import { Subscription } from "rxjs";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* services */
import { NotifyService } from "@services/notifications/notify.service";

/* models */
import {
  ActiveNotification,
  INotify,
  ResponseStatus,
  ResponseStatusIcon,
} from "@entities/response.model";

@Component({
  selector: "app-window-notify",
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: "./window-notify.component.html",
})
export class WindowNotifyComponent implements OnInit, OnDestroy {
  notifications: ActiveNotification[] = [];
  private nextId = 1;
  private readonly NOTIFICATION_DURATION = 3000;
  private readonly ANIMATION_DURATION = 300;
  private readonly INTERACTION_TIMER_DURATION = 10000;
  private subscription: Subscription = new Subscription();

  isHover: boolean = false;
  private swipeStates: Map<number, { startX: number; currentX: number }> = new Map();
  private readonly SWIPE_THRESHOLD = 100;

  constructor(private notifyService: NotifyService) {}

  ngOnInit() {
    this.subscription = this.notifyService.getNotifySubject().subscribe((value: INotify) => {
      if (value) {
        this.addNotification(value);
      }
    });
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  addNotification(notification: INotify) {
    if (notification.message == "") return;

    if (this.notifications.length >= 5) {
      this.prepareToRemove(this.notifications[0].id);
    }

    const id = this.nextId++;
    const newNotification: ActiveNotification = {
      ...notification,
      id,
      icon: this.getIconForStatus(notification.status),
    };

    this.notifications.push(newNotification);

    setTimeout(() => {
      this.startNotificationTimer(id);
    }, 100);
  }

  startNotificationTimer(id: number, duration?: number) {
    const notification = this.notifications.find((n) => n.id === id);
    if (!notification) return;

    const effectiveDuration = duration ?? this.NOTIFICATION_DURATION;

    const timeoutId = setTimeout(() => {
      this.prepareToRemove(id);
    }, effectiveDuration);

    notification.timeoutId = timeoutId as unknown as number;
  }

  prepareToRemove(id: number) {
    const notification = this.notifications.find((n) => n.id === id);
    if (!notification) return;

    const element = document.querySelector(`.notification-item[data-id="${id}"]`) as HTMLElement;
    if (element) {
      element.classList.add("animate-fadeOut");
    }

    setTimeout(() => {
      element?.classList.remove("animate-slideInRight", "animate-fadeOut");
      this.removeNotification(id);
    }, this.ANIMATION_DURATION);
  }

  removeNotification(id: number) {
    const index = this.notifications.findIndex((n) => n.id === id);
    if (index === -1) return;

    if (this.notifications[index].intervalId) {
      clearInterval(this.notifications[index].intervalId);
    }
    if (this.notifications[index].timeoutId) {
      clearTimeout(this.notifications[index].timeoutId);
    }

    this.notifications.splice(index, 1);
  }

  closeNotification(id: number) {
    const notification = this.notifications.find((n) => n.id === id);
    if (!notification) return;

    if (notification.intervalId) {
      clearInterval(notification.intervalId);
    }
    if (notification.timeoutId) {
      clearTimeout(notification.timeoutId);
    }

    this.prepareToRemove(id);
  }

  onSwipeStart(event: TouchEvent, id: number) {
    const touch = event.touches[0];
    this.swipeStates.set(id, { startX: touch.clientX, currentX: touch.clientX });
    const element = document.querySelector(`.notification-item[data-id="${id}"]`) as HTMLElement;
    if (element) {
      element.style.transition = "none";
      element.classList.remove("animate-slideInRight");
    }
    const notification = this.notifications.find((n) => n.id === id);
    if (notification?.timeoutId) {
      clearTimeout(notification.timeoutId);
      notification.timeoutId = undefined;
    }
  }

  onSwipeMove(event: TouchEvent, id: number) {
    const touch = event.touches[0];
    const state = this.swipeStates.get(id);
    if (state) {
      state.currentX = touch.clientX;
    }
  }

  onSwipeEnd(_event: TouchEvent, id: number) {
    const state = this.swipeStates.get(id);
    if (!state) return;

    const deltaX = state.currentX - state.startX;
    this.swipeStates.delete(id);

    if (Math.abs(deltaX) > this.SWIPE_THRESHOLD) {
      this.closeNotification(id);
    } else {
      const element = document.querySelector(`.notification-item[data-id="${id}"]`) as HTMLElement;
      if (element) {
        element.style.transition = "transform 0.2s ease-out";
        element.style.transform = "translateX(0)";
        setTimeout(() => {
          element.style.transition = "";
          element.classList.add("animate-slideInRight");
        }, 200);
      }
      this.startNotificationTimer(id, this.INTERACTION_TIMER_DURATION);
    }
  }

  getTranslateX(id: number): number {
    const state = this.swipeStates.get(id);
    if (!state) return 0;
    return state.currentX - state.startX;
  }

  getColorForStatus(status: ResponseStatus, type: "border" | "color"): string {
    switch (status) {
      case ResponseStatus.INFO:
        if (type === "border") return "!border-blue-500";
        else if (type === "color") return "!text-blue-500";
        else return "";
      case ResponseStatus.SUCCESS:
        if (type === "border") return "!border-green-700";
        else if (type === "color") return "!text-green-700";
        else return "";
      case ResponseStatus.WARNING:
        if (type === "border") return "!border-yellow-600";
        else if (type === "color") return "!text-yellow-600";
        else return "";
      case ResponseStatus.ERROR:
        if (type === "border") return "!border-red-700";
        else if (type === "color") return "!text-red-700";
        else return "";
      default:
        return "";
    }
  }

  getIconForStatus(status: ResponseStatus): ResponseStatusIcon {
    switch (status) {
      case ResponseStatus.INFO:
        return ResponseStatusIcon.INFO;
      case ResponseStatus.SUCCESS:
        return ResponseStatusIcon.SUCCESS;
      case ResponseStatus.WARNING:
        return ResponseStatusIcon.WARNING;
      case ResponseStatus.ERROR:
        return ResponseStatusIcon.ERROR;
      default:
        return ResponseStatusIcon[""];
    }
  }

  getNotificationTitle(status: ResponseStatus): string {
    switch (status) {
      case ResponseStatus.SUCCESS:
        return "Success Message";
      case ResponseStatus.INFO:
        return "Info Message";
      case ResponseStatus.WARNING:
        return "Warning Message";
      case ResponseStatus.ERROR:
        return "Error Message";
      default:
        return "Notification";
    }
  }
}
