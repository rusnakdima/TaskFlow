/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal, inject, DestroyRef } from "@angular/core";
import { Router, RouterModule } from "@angular/router";

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
import { ApiService } from "@services/api.service";
import { UnifiedSyncService } from "@services/sync/unified-sync.service";
import { ShortcutService } from "@services/ui/shortcut.service";

/* components */
import { TableViewComponent } from "@components/table-view/table-view.component";
import { TableField } from "@models/table-field.model";
import {
  SegmentSelectorComponent,
  SegmentOption,
} from "@components/segment-selector/segment-selector.component";
import {
  PullToRefreshDirective,
  PullToRefreshIndicatorComponent,
} from "@components/pull-to-refresh";

@Component({
  selector: "app-stats",
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    TableViewComponent,
    SegmentSelectorComponent,
    PullToRefreshDirective,
    PullToRefreshIndicatorComponent,
  ],
  templateUrl: "./stats.view.html",
})
export class StatsView implements OnInit {
  private requestService = inject(ApiService);
  private syncService = inject(UnifiedSyncService);
  private shortcutService = inject(ShortcutService);
  private destroyRef = inject(DestroyRef);
  private router = inject(Router);

  refreshState = signal<"idle" | "pulling" | "triggered" | "refreshing" | "complete">("idle");
  refreshDistance = signal(0);

  private authService = inject(AuthService);
  private notifyService = inject(NotifyService);

  selectedTimeRange = signal<string>("week");

  timeRanges: SegmentOption[] = [
    { id: "day", label: "This Day", icon: "today" },
    { id: "week", label: "This Week", icon: "date_range" },
    { id: "month", label: "This Month", icon: "calendar_month" },
    { id: "quarter", label: "This Quarter", icon: "calendar_view_month" },
    { id: "year", label: "This Year", icon: "calendar_today" },
  ];

  statistics = signal<Statistics>({
    total_tasks: 0,
    completion_rate: 0,
    average_task_time: 0,
    productivity_score: 0,
    previous_total_tasks: 0,
    previous_completion_rate: 0,
    previous_average_time: 0,
    previous_productivity_score: 0,
  });

  chartData = signal<ChartData>({
    completion_trend: [],
    categories: [],
    daily_activity: [],
  });

  achievements = signal<Achievement[]>([]);

  detailedMetrics = signal<DetailedMetric[]>([]);

  detailedMetricsFields: TableField[] = [
    { key: "name", label: "Metric", type: "text" },
    { key: "current", label: "Current Period", type: "text" },
    { key: "previous", label: "Previous Period", type: "text" },
    { key: "change", label: "Change", type: "change" },
  ];

  categoryDetailFields: TableField[] = [
    { key: "name", label: "Category", type: "text" },
    { key: "count", label: "Total Tasks", type: "number" },
    {
      key: "completed",
      label: "Completed",
      type: "number",
      getValue: (item: Record<string, unknown>) =>
        Math.round(Number(item["count"]) * (Number(item["percentage"]) / 100)).toString(),
    },
    {
      key: "percentage",
      label: "Completion %",
      type: "text",
      getValue: (item: Record<string, unknown>) => `${item["percentage"]}%`,
    },
  ];

  ngOnInit(): void {
    // Data is already loaded in app.ts, just load statistics
    this.loadStatistics();

    const refreshSub = this.shortcutService.refresh$.subscribe(() => {
      if (!this.authService.isLoggedIn()) {
        this.router.navigate(["/login"]);
        return;
      }
      this.refreshState.set("refreshing");
      this.syncService.refreshLocal().finally(() => {
        this.refreshState.set("idle");
      });
    });
    this.destroyRef.onDestroy(() => refreshSub.unsubscribe());
  }

  onPullToRefresh(): Promise<void> {
    return this.syncService.syncAll() as unknown as Promise<void>;
  }

  loadStatistics(): void {
    const userId: string = this.authService.getValueByKey("id");

    if (userId && userId !== "") {
      this.requestService
        .invokeCommand<StatisticsResponse>("statistics_get", {
          userId,
          timeRange: this.selectedTimeRange(),
        })
        .subscribe({
          next: (data: any) => {
            if (data?.statistics) {
              this.statistics.set(data.statistics);
              this.chartData.set(
                data.chart_data || { completion_trend: [], categories: [], daily_activity: [] }
              );
              this.achievements.set(data.achievements || []);
              this.detailedMetrics.set(data.detailed_metrics || []);
            }
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
