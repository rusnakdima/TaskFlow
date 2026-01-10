/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal } from "@angular/core";
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
import { NotifyService } from "@services/notify.service";
import { AuthService } from "@services/auth.service";
import { StatisticsService } from "@services/statistics.service";
import { Response, ResponseStatus } from "@models/response.model";

@Component({
  selector: "app-stats",
  standalone: true,
  providers: [StatisticsService],
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: "./stats.view.html",
})
export class StatsView implements OnInit {
  constructor(
    private authService: AuthService,
    private notifyService: NotifyService,
    private statisticsService: StatisticsService
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

  achievements = signal<Achievement[]>([
    // {
    //   title: "10 Day Streak",
    //   description: "Completed tasks for 10 consecutive days",
    //   icon: "local_fire_department",
    //   color: "#F59E0B",
    //   date: "2 days ago",
    // },
    // {
    //   title: "Early Bird",
    //   description: "Completed 5 tasks before 9 AM",
    //   icon: "wb_sunny",
    //   color: "#3B82F6",
    //   date: "1 week ago",
    // },
    // {
    //   title: "Task Master",
    //   description: "Completed 100 tasks total",
    //   icon: "emoji_events",
    //   color: "#10B981",
    //   date: "2 weeks ago",
    // },
  ]);

  detailedMetrics = signal<DetailedMetric[]>([]);

  ngOnInit(): void {
    this.loadStatistics();
  }

  async loadStatistics(): Promise<void> {
    const userId: string = this.authService.getValueByKey("id");

    if (userId && userId !== "") {
      await this.statisticsService
        .getStatistics(userId, this.selectedTimeRange())
        .then((response: Response<StatisticsResponse>) => {
          if (response.status == ResponseStatus.SUCCESS) {
            this.statistics.set(response.data.statistics);
            this.chartData.set(response.data.chartData);
            this.achievements.set(response.data.achievements);
            this.detailedMetrics.set(response.data.detailedMetrics);
          }
        })
        .catch((err: Response<string>) => {
          this.notifyService.showError(err.message);
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
