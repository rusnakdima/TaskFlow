/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, inject, computed, signal, DestroyRef } from "@angular/core";
import { Router, RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { TaskStatus } from "@models/generated/api.types";

/* services */
import { UnifiedStorageService } from "@services/core/unified-storage.service";
import { UnifiedSyncService } from "@services/sync/unified-sync.service";
import { ShortcutService } from "@services/ui/shortcut.service";

/* helpers */
import { DateHelper } from "@helpers/date.helper";
import { getLatestTimestamp, compareByTimestamp } from "@helpers/array.helper";
import {
  PullToRefreshDirective,
  PullToRefreshIndicatorComponent,
} from "@components/pull-to-refresh";
import { AppButtonComponent } from "@components/shared/button/button.component";

interface DisplayTask {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueDate: string | null;
  created_at: string | undefined;
  updated_at: string | undefined;
  todo_id?: string;
  isPrivate: boolean;
  isOwner: boolean;
}

@Component({
  selector: "app-dashboard",
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    PullToRefreshDirective,
    PullToRefreshIndicatorComponent,
    AppButtonComponent,
  ],
  templateUrl: "./dashboard.view.html",
})
export class DashboardView implements OnInit {
  public TaskStatus = TaskStatus;

  private storage = inject(UnifiedStorageService);
  private router = inject(Router);
  private syncService = inject(UnifiedSyncService);
  private shortcutService = inject(ShortcutService);
  private destroyRef = inject(DestroyRef);

  refreshState = signal<"idle" | "pulling" | "triggered" | "refreshing" | "complete">("idle");
  refreshDistance = signal(0);

  profile = computed(() => {
    const profiles = this.storage.profiles();
    return profiles.length > 0 ? profiles[0] : null;
  });

  private allTasksData = computed<DisplayTask[]>(() => {
    const currentTasks = this.storage.activeTasks();

    return currentTasks
      .map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description ?? null,
        status: task.status,
        dueDate: task.end_date ?? null,
        created_at: task.created_at,
        updated_at: task.updated_at,
        todo_id: task.todo_id,
        isPrivate: false,
        isOwner: false,
      }))
      .sort((a, b) => getLatestTimestamp(b) - getLatestTimestamp(a));
  });

  totalTasks = computed(() => this.allTasksData().length);
  completedTasks = computed(
    () =>
      this.allTasksData().filter(
        (task) => task.status === TaskStatus.COMPLETED || task.status === TaskStatus.SKIPPED
      ).length
  );
  inProgressTasks = computed(() => {
    const now = new Date();
    return this.allTasksData().filter((task) => {
      if (task.status !== TaskStatus.PENDING && task.status !== TaskStatus.FAILED) return false;
      const start = task.dueDate ? new Date(task.dueDate) : null;
      return start && start <= now;
    }).length;
  });
  overdueTasks = computed(() => {
    const now = new Date();
    return this.allTasksData().filter((task) => {
      if (task.status !== TaskStatus.PENDING && task.status !== TaskStatus.FAILED) return false;
      const end = task.dueDate ? new Date(task.dueDate) : null;
      return end && end < now;
    }).length;
  });
  filteredTasks = computed(() => this.allTasksData().slice(0, 10));
  recentActivities = computed(() => {
    return [...this.allTasksData()]
      .sort((a, b) => compareByTimestamp(a, b) * -1)
      .slice(0, 4)
      .map((task) => {
        let text = "";
        if (task.status === TaskStatus.COMPLETED) {
          text = `Completed task: ${task.title}`;
        } else if (task.status === TaskStatus.SKIPPED) {
          text = `Skipped task: ${task.title}`;
        } else if (task.status === TaskStatus.FAILED) {
          text = `Failed task: ${task.title}`;
        } else {
          text = `Created task: ${task.title}`;
        }
        return { text, status: task.status };
      });
  });

  constructor() {}

  ngOnInit(): void {
    this.storage.ensureUserLoaded();
    this.storage.ensureProfileLoaded();
    this.storage.ensureTasksLoaded();

    const refreshSub = this.shortcutService.refresh$.subscribe(() => {
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

  getCircleColor(status: TaskStatus): string {
    switch (status) {
      case TaskStatus.COMPLETED:
        return "bg-green-700 dark:bg-green-300";
      case TaskStatus.SKIPPED:
        return "bg-orange-700 dark:bg-orange-300";
      case TaskStatus.FAILED:
        return "bg-red-700 dark:bg-red-300";
      case TaskStatus.PENDING:
      default:
        return "bg-blue-700 dark:bg-blue-300";
    }
  }

  getProgressPercentage(): number {
    const total = this.totalTasks();
    if (total === 0) return 0;
    return Math.round((this.completedTasks() / total) * 100);
  }

  formatDate(dateString: string): string {
    return DateHelper.formatDateShort(dateString);
  }

  getLastTime(task: DisplayTask): string {
    const latestDate = new Date(getLatestTimestamp(task));
    if (!latestDate || isNaN(latestDate.getTime())) {
      return "-";
    }
    return this.formatDate(latestDate.toISOString());
  }

  navigateToTodos(): void {
    this.router.navigate(["/todos"]);
  }

  navigateToTasks(task: DisplayTask): void {
    this.router.navigate(["/todos", task.todo_id, "tasks"], {
      queryParams: {
        highlightTaskId: task.id,
      },
    });
  }
}
