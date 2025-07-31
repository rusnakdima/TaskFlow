/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* services */
import { NotifyService } from "@services/notify.service";

/* models */
import {
  ActiveNotification,
  INotify,
  ResponseStatus,
  ResponseStatusIcon,
} from "@models/response";

@Component({
  selector: "app-window-notify",
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: "./window-notify.component.html",
})
export class WindowNotifyComponent implements OnInit {
  constructor(private notifyService: NotifyService) {}

  notifications: ActiveNotification[] = [];
  private nextId = 1;
  private readonly NOTIFICATION_DURATION = 3000;
  private readonly ANIMATION_DURATION = 300;
  private readonly PROGRESS_INTERVAL = 60;

  ngOnInit() {
    this.notifyService.notify.subscribe((value: INotify) => {
      if (value) {
        this.addNotification(value);
      }
    });
  }

  addNotification(notification: INotify) {
    const color = this.getColorForStatus(notification.status);
    if (!color) return;

    if (this.notifications.length >= 5) {
      this.removeNotification(this.notifications[0].id);
    }

    const id = this.nextId++;
    const newNotification: ActiveNotification = {
      ...notification,
      id,
      color,
      width: 100,
      icon: this.getIconForStatus(notification.status),
    };

    this.notifications.push(newNotification);

    setTimeout(() => {
      this.startNotificationTimer(id);
    }, 100);
  }

  startNotificationTimer(id: number) {
    const notification = this.notifications.find((n) => n.id === id);
    if (!notification) return;

    const steps = this.NOTIFICATION_DURATION / this.PROGRESS_INTERVAL;
    const decrementValue = 100 / steps;

    const intervalId = setInterval(() => {
      notification.width -= decrementValue;

      if (notification.width <= 0) {
        clearInterval(intervalId);
        this.prepareToRemove(id);
      }
    }, this.PROGRESS_INTERVAL);

    const timeoutId = setTimeout(() => {
      this.prepareToRemove(id);
    }, this.NOTIFICATION_DURATION);

    notification.intervalId = intervalId;
    notification.timeoutId = timeoutId;
  }

  prepareToRemove(id: number) {
    const notification = this.notifications.find((n) => n.id === id);
    if (!notification) return;

    const element = document.querySelector(
      `.notification-item[data-id="${id}"]`,
    ) as HTMLElement;
    if (element) {
      element.classList.add("animate-fadeOut");
    }

    setTimeout(() => {
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

  getColorForStatus(status: ResponseStatus): string {
    switch (status) {
      case ResponseStatus.INFO:
        return "bg-blue-500";
      case ResponseStatus.SUCCESS:
        return "bg-green-700";
      case ResponseStatus.WARNING:
        return "bg-yellow-500";
      case ResponseStatus.ERROR:
        return "bg-red-700";
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
