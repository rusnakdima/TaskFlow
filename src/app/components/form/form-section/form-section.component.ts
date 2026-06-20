import { Component, Input, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
@Component({
  selector: "app-form-section",
  standalone: true,
  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./form-section.component.html",
})
export class FormSectionComponent {
  @Input() icon = "";
  @Input() title = "";
  @Input() description = "";
  @Input() iconColor: "blue" | "purple" | "green" | "indigo" | "red" = "blue";
  get iconBgClass(): string {
    const classes: Record<string, string> = {
      blue: "flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30",
      purple:
        "flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30",
      green:
        "flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30",
      indigo:
        "flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/30",
      red: "flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30",
    };
    return classes[this.iconColor] ?? classes["blue"];
  }
  get iconClass(): string {
    const classes: Record<string, string> = {
      blue: "h-5! w-5! min-w-5 text-xl! text-blue-600 dark:text-blue-400",
      purple: "h-5! w-5! min-w-5 text-xl! text-purple-600 dark:text-purple-400",
      green: "h-5! w-5! min-w-5 text-xl! text-green-600 dark:text-green-400",
      indigo: "h-5! w-5! min-w-5 text-xl! text-indigo-600 dark:text-indigo-400",
      red: "h-5! w-5! min-w-5 text-xl! text-red-600 dark:text-red-400",
    };
    return classes[this.iconColor] ?? classes["blue"];
  }
}
