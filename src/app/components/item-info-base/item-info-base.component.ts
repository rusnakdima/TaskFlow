/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, Input, signal } from "@angular/core";
import { RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* components */

/* helpers */
import { DateHelper } from "@helpers/date.helper";

export enum ItemInfoColorScheme {
  GREEN = "green",
  BLUE = "blue",
}

@Component({
  selector: "app-item-info-base",
  standalone: true,
  providers: [],
  imports: [CommonModule, MatIconModule, RouterModule],
  templateUrl: "./item-info-base.component.html",
})
export abstract class ItemInfoBaseComponent {
  @Input() isOwner: boolean = true;
  @Input() isPrivate: boolean = true;
  @Input() start_date?: string | null;
  @Input() end_date?: string | null;

  @Input() set completed(value: number) {
    this._completed.set(value);
  }
  @Input() set skipped(value: number) {
    this._skipped.set(value);
  }
  @Input() set failed(value: number) {
    this._failed.set(value);
  }
  @Input() set inProgress(value: number) {
    this._inProgress.set(value);
  }

  protected _completed = signal(0);
  protected _skipped = signal(0);
  protected _failed = signal(0);
  protected _inProgress = signal(0);

  protected colorScheme = signal<ItemInfoColorScheme>(ItemInfoColorScheme.GREEN);

  protected formatDate = DateHelper.formatDateShort;

  completedCount(): number {
    return this._completed();
  }

  skippedCount(): number {
    return this._skipped();
  }

  failedCount(): number {
    return this._failed();
  }

  inProgressCount(): number {
    return this._inProgress();
  }

  protected headerClass(): string {
    const scheme = this.colorScheme();
    switch (scheme) {
      case ItemInfoColorScheme.GREEN:
        return "bg-linear-to-r from-green-500 to-green-600 dark:from-green-600 dark:to-green-700";
      case ItemInfoColorScheme.BLUE:
        return "bg-linear-to-r from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700";
      default:
        return "bg-linear-to-r from-green-500 to-green-600 dark:from-green-600 dark:to-green-700";
    }
  }

  protected accentColorClass(): string {
    const scheme = this.colorScheme();
    switch (scheme) {
      case ItemInfoColorScheme.GREEN:
        return "text-green-100";
      case ItemInfoColorScheme.BLUE:
        return "text-blue-100";
      default:
        return "text-green-100";
    }
  }
}
