/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, inject, computed, DestroyRef, signal, OnDestroy } from "@angular/core";
import { Router, RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Task, TaskStatus } from "@models/task.model";
import { Profile } from "@models/profile.model";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { REQUEST_SERVICE } from "@services/api.service";
import { StorageService } from "@services/storage.service";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";

/* helpers */
import { DateHelper } from "@helpers/date.helper";
import { getLatestTimestamp, compareByTimestamp } from "@helpers/array.helper";

interface DisplayTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  dueDate: string | null;
  created_at: string;
  updated_at: string;
  todo_id?: string;
  isPrivate: boolean;
  isOwner: boolean;
}

@Component({
  selector: "app-dashboard",
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: "./dashboard.view.html",
})
export class DashboardView implements OnInit {
  public TaskStatus = TaskStatus;

  private authService = inject(AuthService);
  private requestService = inject(REQUEST_SERVICE);
  private storageService = inject(StorageService);
  private destroyRef = inject(DestroyRef);
  private router = inject(Router);

  profile = computed(() => this.storageService.profile());
  userId = "";

  private profileLoaded = false;

  private allTasksData = computed<DisplayTask[]>(() => {
    const currentTasks = this.storageService.tasks();

    return currentTasks
      .filter((t) => !t.deleted_at)
      .map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        dueDate: task.end_date,
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
    this.userId = this.authService.getValueByKey("id");
    this.loadProfile();
    this.requestService.getAll("tasks", { visibility: "all", limit: 10, skip: 0 }).subscribe({});
  }

  private loadProfile(): void {
    if (this.profileLoaded && this.profile()) {
      return;
    }

    const storedProfile = this.storageService.profile();
    const storedUser = this.storageService.user();

    if (storedProfile && storedUser) {
      this.profileLoaded = true;
      return;
    }

    if (this.storageService.isLoading()) {
      let attempts = 0;
      const maxAttempts = 10;
      const checkStorage = () => {
        attempts++;
        const profile = this.storageService.profile();
        const user = this.storageService.user();
        if (profile && user) {
          this.profileLoaded = true;
          return;
        }
        if (attempts < maxAttempts) {
          setTimeout(checkStorage, 100);
        } else {
          this.fetchProfileFromApi();
        }
      };
      setTimeout(checkStorage, 100);
      return;
    }

    this.fetchProfileFromApi();
  }

  private fetchProfileFromApi(): void {
    const userId = this.authService.getValueByKey("id");
    this.requestService
      .getAll<Profile>("profiles", {
        visibility: "private",
        filter: { user_id: userId },
        load: ["user"],
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (profiles) => {
          if (profiles && profiles.length > 0) {
            this.storageService.setCollection("profiles", profiles[0]);
            if (profiles[0].user) {
              this.storageService.setCollection("user", profiles[0].user);
            }
            this.profileLoaded = true;
          }
        },
        error: () => {},
      });
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
