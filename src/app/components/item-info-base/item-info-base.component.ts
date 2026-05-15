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

  protected colorScheme = signal<ItemInfoColorScheme>(ItemInfoColorScheme.GREEN);

  protected formatDate = DateHelper.formatDateShort;

  protected headerClass(): string {
    return "bg-[var(--accent-color)] dark:bg-[var(--accent-600)]";
  }

  protected accentColorClass(): string {
    return "text-white/80";
  }
}
