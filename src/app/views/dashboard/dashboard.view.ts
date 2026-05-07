/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, inject, computed, DestroyRef } from "@angular/core";
import { Router, RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Task, TaskStatus } from "@models/task.model";
import { Profile } from "@models/profile.model";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { DataLoaderService } from "@services/data/data-loader.service";
import { UnifiedStorageService } from "@app/store/unified-storage.service";

/* helpers */
import { DateHelper } from "@helpers/date.helper";

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
  private dataLoaderService = inject(DataLoaderService);
  private storageService = inject(UnifiedStorageService);
  private destroyRef = inject(DestroyRef);
  private router = inject(Router);

  profile: () => Profile | null;
  userId = "";

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
      .sort((a, b) => {
        const aTime = Math.max(new Date(a.created_at).getTime(), new Date(a.updated_at).getTime());
        const bTime = Math.max(new Date(b.created_at).getTime(), new Date(b.updated_at).getTime());
        return bTime - aTime;
      });
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
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
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

  constructor() {
    this.profile = this.storageService.profile;
  }

  ngOnInit(): void {
    this.userId = this.authService.getValueByKey("id");
    this.dataLoaderService.loadInitialTasks("all", 10).subscribe();
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
    const createdAt = new Date(task.created_at);
    const updatedAt = new Date(task.updated_at);
    const createdTime = isNaN(createdAt.getTime()) ? 0 : createdAt.getTime();
    const updatedTime = isNaN(updatedAt.getTime()) ? 0 : updatedAt.getTime();
    const latestDate = new Date(Math.max(createdTime, updatedTime));
    if (isNaN(latestDate.getTime())) {
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
