import { Component, Input, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ThemeService } from "@services/ui/theme.service";
import { inject } from "@angular/core";

@Component({
  selector: "app-online-status",
  standalone: true,
  imports: [CommonModule],
  template: `
    <span
      class="absolute right-0 bottom-0 block rounded-full border-2"
      [ngClass]="indicatorClasses"
    ></span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnlineStatusComponent {
  private themeService = inject(ThemeService);

  @Input() isOnline: boolean = false;
  @Input() size: "sm" | "md" | "lg" = "md";

  get indicatorClasses(): string {
    const base = this.isOnline ? "bg-emerald-500" : "bg-slate-300 dark:bg-zinc-700";

    const dimension =
      this.size === "sm" ? "h-2.5 w-2.5" : this.size === "md" ? "h-3 w-3" : "h-3.5 w-3.5";

    const border =
      this.themeService.getEffectiveMode() === "dark" ? "border-zinc-900" : "border-white";

    return `${base} ${dimension} ${border}`;
  }
}
