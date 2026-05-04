import { Component, Input, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";

@Component({
  selector: "app-stats-card",
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: "./stats-card.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatsCardComponent {
  @Input() label = "";
  @Input() value: number | string = 0;
  @Input() icon = "assignment";
  @Input() iconBgClass = "bg-blue-500";

  get gradientClass(): string {
    const colorMap: Record<string, string> = {
      "bg-blue-500": "from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700",
      "bg-orange-500": "from-orange-500 to-orange-600 dark:from-orange-600 dark:to-orange-700",
      "bg-green-500": "from-green-500 to-green-600 dark:from-green-600 dark:to-green-700",
      "bg-purple-500": "from-purple-500 to-purple-600 dark:from-purple-600 dark:to-purple-700",
      "bg-red-500": "from-red-500 to-red-600 dark:from-red-600 dark:to-red-700",
      "bg-cyan-500": "from-cyan-500 to-cyan-600 dark:from-cyan-600 dark:to-cyan-700",
      "bg-yellow-500": "from-yellow-500 to-yellow-600 dark:from-yellow-600 dark:to-yellow-700",
      "bg-pink-500": "from-pink-500 to-pink-600 dark:from-pink-600 dark:to-pink-700",
    };
    return (
      colorMap[this.iconBgClass] || "from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700"
    );
  }
}
