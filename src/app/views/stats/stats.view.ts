/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Statistics, ChartData, Achievement, DetailedMetric } from "@models/statistics";

/* services */
import { NotifyService } from "@services/notify.service";
import { AuthService } from "@services/auth.service";
import { StatisticsService } from "@services/statistics.service";

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

  selectedTimeRange: string = "week";

  timeRanges = [
    { key: "day", label: "This Day" },
    { key: "week", label: "This Week" },
    { key: "month", label: "This Month" },
    { key: "quarter", label: "This Quarter" },
    { key: "year", label: "This Year" },
  ];

  statistics: Statistics = {
    totalTasks: 0,
    completionRate: 0,
    averageTaskTime: 0,
    productivityScore: 0,
    previousTotalTasks: 0,
    previousCompletionRate: 0,
    previousAverageTime: 0,
    previousProductivityScore: 0,
  };

  chartData: ChartData = {
    completionTrend: [],
    categories: [],
    dailyActivity: [],
  };

  achievements: Achievement[] = [
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
  ];

  detailedMetrics: DetailedMetric[] = [];

  ngOnInit(): void {
    this.loadStatistics();
  }

  async loadStatistics(): Promise<void> {
    const userId: string = this.authService.getValueByKey("id");

    if (userId && userId !== "") {
      try {
        const data = await this.statisticsService.getStatistics(userId, this.selectedTimeRange);
        this.statistics = data.statistics;
        this.chartData = data.chartData;
        this.achievements = data.achievements;
        this.detailedMetrics = data.detailedMetrics;
      } catch (error) {
        this.notifyService.showError("Failed to load statistics");
      }
    }
  }

  getPercentageChange(current: number, previous: number): number {
    if (previous === 0) return 0;
    return Math.round(((current - previous) / previous) * 100);
  }

  changeTimeRange(range: string): void {
    this.selectedTimeRange = range;
    this.loadStatistics();
  }
}
