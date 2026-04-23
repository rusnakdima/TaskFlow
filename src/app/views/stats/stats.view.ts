/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal, inject } from "@angular/core";
import { RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import {
  Statistics,
  ChartData,
  Achievement,
  DetailedMetric,
  StatisticsResponse,
} from "@models/statistics.model";

/* services */
import { NotifyService } from "@services/notifications/notify.service";
import { AuthService } from "@services/auth/auth.service";

/* providers */
import { ApiProvider } from "@providers/api.provider";

@Component({
  selector: "app-stats",
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: "./stats.view.html",
})
export class StatsView implements OnInit {
  private dataSyncProvider = inject(ApiProvider);

  constructor(
    private authService: AuthService,
    private notifyService: NotifyService
  ) {}

  selectedTimeRange = signal<string>("week");

  timeRanges = [
    { key: "day", label: "This Day" },
    { key: "week", label: "This Week" },
    { key: "month", label: "This Month" },
    { key: "quarter", label: "This Quarter" },
    { key: "year", label: "This Year" },
  ];

  statistics = signal<Statistics>({
    totalTasks: 0,
    completionRate: 0,
    averageTaskTime: 0,
    productivityScore: 0,
    previousTotalTasks: 0,
    previousCompletionRate: 0,
    previousAverageTime: 0,
    previousProductivityScore: 0,
  });

  chartData = signal<ChartData>({
    completionTrend: [],
    categories: [],
    dailyActivity: [],
  });

  achievements = signal<Achievement[]>([]);

  detailedMetrics = signal<DetailedMetric[]>([]);

  ngOnInit(): void {
    // Data is already loaded in app.ts, just load statistics
    this.loadStatistics();
  }

  loadStatistics(): void {
    const userId: string = this.authService.getValueByKey("id");

    if (userId && userId !== "") {
      this.dataSyncProvider
        .invokeCommand<StatisticsResponse>("statistics_get", {
          user_id: userId,
          time_range: this.selectedTimeRange(),
        })
        .subscribe({
          next: (response: StatisticsResponse) => {
            this.statistics.set(response.statistics);
            this.chartData.set(response.chartData);
            this.achievements.set(response.achievements);
            this.detailedMetrics.set(response.detailedMetrics);
          },
          error: (err: unknown) => {
            const message = err instanceof Error ? err.message : "Failed to load statistics";
            this.notifyService.showError(message);
          },
        });
    }
  }

  getPercentageChange(current: number, previous: number): number {
    if (previous === 0) return 0;
    return Math.round(((current - previous) / previous) * 100);
  }

  changeTimeRange(range: string): void {
    this.selectedTimeRange.set(range);
    this.loadStatistics();
  }
}
