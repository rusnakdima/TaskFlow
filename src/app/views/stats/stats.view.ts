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

/* components */
import { TableViewComponent } from "@components/table-view/table-view.component";
import { TableField } from "@components/table-view/table-field.model";
import {
  SegmentSelectorComponent,
  SegmentOption,
} from "@components/segment-selector/segment-selector.component";

@Component({
  selector: "app-stats",
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    TableViewComponent,
    SegmentSelectorComponent,
  ],
  templateUrl: "./stats.view.html",
})
export class StatsView implements OnInit {
  private dataSyncProvider = inject(ApiProvider);

  constructor(
    private authService: AuthService,
    private notifyService: NotifyService
  ) {}

  selectedTimeRange = signal<string>("week");

  timeRanges: SegmentOption[] = [
    { id: "day", label: "This Day", icon: "today" },
    { id: "week", label: "This Week", icon: "date_range" },
    { id: "month", label: "This Month", icon: "calendar_month" },
    { id: "quarter", label: "This Quarter", icon: "calendar_view_month" },
    { id: "year", label: "This Year", icon: "calendar_today" },
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

  detailedMetricsFields: TableField[] = [
    { key: "name", label: "Metric", type: "text" },
    { key: "current", label: "Current Period", type: "text" },
    { key: "previous", label: "Previous Period", type: "text" },
    { key: "change", label: "Change", type: "change" },
  ];

  ngOnInit(): void {
    // Data is already loaded in app.ts, just load statistics
    this.loadStatistics();
  }

  loadStatistics(): void {
    const userId: string = this.authService.getValueByKey("id");

    if (userId && userId !== "") {
      this.dataSyncProvider
        .invokeCommand<StatisticsResponse>("statistics_get", {
          userId: userId,
          timeRange: this.selectedTimeRange(),
        })
        .subscribe({
          next: (response: any) => {
            this.statistics.set({
              totalTasks: response.statistics.total_tasks,
              completionRate: response.statistics.completion_rate,
              averageTaskTime: response.statistics.average_task_time,
              productivityScore: response.statistics.productivity_score,
              previousTotalTasks: response.statistics.previous_total_tasks,
              previousCompletionRate: response.statistics.previous_completion_rate,
              previousAverageTime: response.statistics.previous_average_time,
              previousProductivityScore: response.statistics.previous_productivity_score,
            });
            this.chartData.set({
              completionTrend: response.chart_data.completion_trend,
              categories: response.chart_data.categories,
              dailyActivity: response.chart_data.daily_activity,
            });
            this.achievements.set(response.achievements);
            this.detailedMetrics.set(response.detailed_metrics);
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

  changeTimeRangeFromSelector(id: string): void {
    this.selectedTimeRange.set(id);
    this.loadStatistics();
  }
}
