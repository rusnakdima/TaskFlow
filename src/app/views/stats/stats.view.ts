/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Response, ResponseStatus } from "@models/response";
import { Todo } from "@models/todo";

/* services */
import { MainService } from "@services/main.service";
import { NotifyService } from "@services/notify.service";
import { AuthService } from "@services/auth.service";

interface Statistics {
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  overdueTasks: number;
  averageTaskTime: number;
  productivityScore: number;
  previousTotalTasks: number;
  previousCompletionRate: number;
  previousAverageTime: number;
  previousProductivityScore: number;
}

interface ChartData {
  completionTrend: Array<{ label: string; value: number }>;
  categories: Array<{ name: string; count: number; percentage: number; color: string }>;
  dailyActivity: Array<{ dayName: string; activity: number }>;
}

interface Achievement {
  title: string;
  description: string;
  icon: string;
  color: string;
  date: string;
}

interface DetailedMetric {
  name: string;
  current: string;
  previous: string;
  change: number;
}

@Component({
  selector: "app-stats",
  standalone: true,
  providers: [MainService, NotifyService],
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: "./stats.view.html",
})
export class StatsView implements OnInit {
  constructor(
    private authService: AuthService,
    private mainService: MainService,
    private notifyService: NotifyService
  ) {}

  selectedTimeRange: string = "week";

  timeRanges = [
    { key: "week", label: "This Week" },
    { key: "month", label: "This Month" },
    { key: "quarter", label: "This Quarter" },
    { key: "year", label: "This Year" },
  ];

  statistics: Statistics = {
    totalTasks: 0,
    completedTasks: 0,
    inProgressTasks: 0,
    overdueTasks: 0,
    averageTaskTime: 0,
    productivityScore: 0,
    previousTotalTasks: 0,
    previousCompletionRate: 0,
    previousAverageTime: 0,
    previousProductivityScore: 0,
  };

  chartData: ChartData = {
    completionTrend: [
      { label: "Monday", value: 85 },
      { label: "Tuesday", value: 92 },
      { label: "Wednesday", value: 78 },
      { label: "Thursday", value: 95 },
      { label: "Friday", value: 88 },
      { label: "Saturday", value: 45 },
      { label: "Sunday", value: 30 },
    ],
    categories: [
      { name: "Work", count: 15, percentage: 45, color: "#3B82F6" },
      { name: "Personal", count: 10, percentage: 30, color: "#10B981" },
      { name: "Learning", count: 5, percentage: 15, color: "#F59E0B" },
      { name: "Health", count: 3, percentage: 10, color: "#EF4444" },
    ],
    dailyActivity: [
      { dayName: "Mon", activity: 8 },
      { dayName: "Tue", activity: 6 },
      { dayName: "Wed", activity: 9 },
      { dayName: "Thu", activity: 4 },
      { dayName: "Fri", activity: 7 },
      { dayName: "Sat", activity: 2 },
      { dayName: "Sun", activity: 1 },
    ],
  };

  achievements: Achievement[] = [
    {
      title: "10 Day Streak",
      description: "Completed tasks for 10 consecutive days",
      icon: "local_fire_department",
      color: "#F59E0B",
      date: "2 days ago",
    },
    {
      title: "Early Bird",
      description: "Completed 5 tasks before 9 AM",
      icon: "wb_sunny",
      color: "#3B82F6",
      date: "1 week ago",
    },
    {
      title: "Task Master",
      description: "Completed 100 tasks total",
      icon: "emoji_events",
      color: "#10B981",
      date: "2 weeks ago",
    },
  ];

  detailedMetrics: DetailedMetric[] = [
    { name: "Tasks Created", current: "45", previous: "38", change: 18 },
    { name: "Tasks Completed", current: "32", previous: "28", change: 14 },
    { name: "Average Completion Time", current: "2.3h", previous: "2.8h", change: -18 },
    { name: "On-time Completion", current: "89%", previous: "82%", change: 9 },
    { name: "Weekly Active Days", current: "6", previous: "5", change: 20 },
  ];

  ngOnInit(): void {
    this.loadStatistics();
  }

  loadStatistics(): void {
    const userId: string = this.authService.getValueByKey("id");

    if (userId && userId !== "") {
      this.mainService
        .getAllByField<Array<Todo>>("todo", "userId", userId)
        .then((response: Response<Array<Todo>>) => {
          if (response.status === ResponseStatus.SUCCESS) {
            this.processStatistics(response.data);
          } else {
            this.notifyService.showError(response.message);
          }
        })
        .catch((err: Response<string>) => {
          this.notifyService.showError(err.message);
        });
    }
  }

  processStatistics(todos: Array<Todo>): void {
    this.statistics.totalTasks = todos.length;

    this.statistics.completedTasks = Math.floor(this.statistics.totalTasks * 0.65);
    this.statistics.inProgressTasks = Math.floor(this.statistics.totalTasks * 0.25);
    this.statistics.overdueTasks = Math.floor(this.statistics.totalTasks * 0.1);
    this.statistics.averageTaskTime = parseFloat((Math.random() * 4 + 1).toFixed(1));
    this.statistics.productivityScore = Math.floor(75 + Math.random() * 20);

    this.statistics.previousTotalTasks = Math.floor(this.statistics.totalTasks * 0.85);
    this.statistics.previousCompletionRate = Math.floor(this.getCompletionRate() - 5);
    this.statistics.previousAverageTime = parseFloat(
      (this.statistics.averageTaskTime + 0.5).toFixed(1)
    );
    this.statistics.previousProductivityScore = this.statistics.productivityScore - 8;

    this.updateChartData(todos);
  }

  updateChartData(todos: Array<Todo>): void {
    const categories = new Map<string, number>();

    todos.forEach((todo) => {
      const title = todo.title.toLowerCase();
      if (title.includes("work") || title.includes("project") || title.includes("meeting")) {
        categories.set("Work", (categories.get("Work") || 0) + 1);
      } else if (title.includes("learn") || title.includes("study") || title.includes("course")) {
        categories.set("Learning", (categories.get("Learning") || 0) + 1);
      } else if (title.includes("health") || title.includes("exercise") || title.includes("gym")) {
        categories.set("Health", (categories.get("Health") || 0) + 1);
      } else {
        categories.set("Personal", (categories.get("Personal") || 0) + 1);
      }
    });

    const colors = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"];
    let colorIndex = 0;

    this.chartData.categories = Array.from(categories.entries()).map(([name, count]) => ({
      name,
      count,
      percentage: Math.round((count / this.statistics.totalTasks) * 100),
      color: colors[colorIndex++ % colors.length],
    }));
  }

  getCompletionRate(): number {
    if (this.statistics.totalTasks === 0) return 0;
    return Math.round((this.statistics.completedTasks / this.statistics.totalTasks) * 100);
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
