/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal } from "@angular/core";
import { Router, RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Response, ResponseStatus } from "@models/response.model";
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";
import { Profile } from "@models/profile.model";

/* services */
import { MainService } from "@services/main.service";
import { NotifyService } from "@services/notify.service";
import { AuthService } from "@services/auth.service";
import { DataSyncProvider } from "@services/data-sync.provider";

interface DisplayTask {
  id: string;
  title: string;
  description: string;
  status: string;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
  todoId: string;
}

@Component({
  selector: "app-dashboard",
  standalone: true,
  providers: [MainService, DataSyncProvider],
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: "./dashboard.view.html",
})
export class DashboardView implements OnInit {
  constructor(
    private authService: AuthService,
    private mainService: MainService,
    private notifyService: NotifyService,
    private dataSyncProvider: DataSyncProvider,
    private router: Router
  ) {}

  profile = signal<Profile | null>(null);

  totalTasks = signal(0);
  completedTasks = signal(0);
  inProgressTasks = signal(0);
  overdueTasks = signal(0);

  allTasks = signal<DisplayTask[]>([]);
  filteredTasks = signal<DisplayTask[]>([]);

  recentActivities = signal<string[]>([]);

  ngOnInit(): void {
    const userId: string = this.authService.getValueByKey("id");

    if (userId && userId !== "") {
      this.mainService
        .getByField<Profile>("profile", "userId", userId)
        .then((response: Response<Profile>) => {
          if (response.status === ResponseStatus.SUCCESS) {
            this.profile.set(response.data);
          } else {
            this.notifyService.showError(response.message);
          }
        })
        .catch((err: Response<string>) => {
          this.notifyService.showError(err.message);
        });
    }

    this.loadDashboardData();
  }

  loadDashboardData(): void {
    const userId: string = this.authService.getValueByKey("id");

    if (userId && userId !== "") {
      this.dataSyncProvider
        .getAll<Todo>("todo", { queryType: "private", field: "userId", value: userId })
        .subscribe({
          next: (todos) => {
            this.processTodosData(todos);
          },
          error: (err) => {
            this.notifyService.showError(err.message || "Failed to load dashboard data");
          },
        });
    }
  }

  processTodosData(todos: Array<Todo>): void {
    const allTasks: { task: Task; todoId: string }[] = [];
    todos.forEach((todo) => {
      if (todo.tasks) {
        todo.tasks.forEach((task) => {
          allTasks.push({ task, todoId: todo.id });
        });
      }
    });
    this.processTaskData(allTasks);
  }

  processTaskData(taskData: Array<{ task: Task; todoId: string }>): void {
    const tasks = taskData.map((item) => item.task);
    this.totalTasks.set(tasks.length);

    const now = new Date();

    this.completedTasks.set(
      tasks.filter(
        (task) => task.status === TaskStatus.COMPLETED || task.status === TaskStatus.SKIPPED
      ).length
    );
    this.inProgressTasks.set(
      tasks.filter((task) => {
        if (task.status !== TaskStatus.PENDING && task.status !== TaskStatus.FAILED) return false;
        const start = task.startDate ? new Date(task.startDate) : null;
        const end = task.endDate ? new Date(task.endDate) : null;
        return start && end && start <= now && now <= end;
      }).length
    );
    this.overdueTasks.set(
      tasks.filter((task) => {
        if (task.status !== TaskStatus.PENDING && task.status !== TaskStatus.FAILED) return false;
        const end = task.endDate ? new Date(task.endDate) : null;
        return end && end < now;
      }).length
    );

    const newAllTasks = taskData
      .map((item) => ({
        id: item.task.id,
        title: item.task.title,
        description: item.task.description,
        status: this.getTaskStatus(item.task),
        dueDate: item.task.endDate,
        createdAt: item.task.createdAt,
        updatedAt: item.task.updatedAt,
        todoId: item.todoId,
      }))
      .sort((a, b) => {
        const aTime = Math.max(new Date(a.createdAt).getTime(), new Date(a.updatedAt).getTime());
        const bTime = Math.max(new Date(b.createdAt).getTime(), new Date(b.updatedAt).getTime());
        return bTime - aTime;
      });

    this.allTasks.set(newAllTasks);

    const sortedTasks = [...tasks].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    this.recentActivities.set(
      sortedTasks.slice(0, 4).map((task) => {
        if (task.status === TaskStatus.COMPLETED) {
          return `Completed task: ${task.title}`;
        } else if (task.status === TaskStatus.SKIPPED) {
          return `Skipped task: ${task.title}`;
        } else if (task.status === TaskStatus.FAILED) {
          return `Failed task: ${task.title}`;
        } else {
          return `Created task: ${task.title}`;
        }
      })
    );

    this.filteredTasks.set(newAllTasks.slice(0, 10));
  }

  getTaskStatus(task: Task): string {
    if (task.status === TaskStatus.COMPLETED) return "completed";
    if (task.status === TaskStatus.SKIPPED) return "skipped";
    if (task.status === TaskStatus.FAILED) return "failed";

    const now = new Date();
    const start = task.startDate ? new Date(task.startDate) : null;
    const end = task.endDate ? new Date(task.endDate) : null;

    if (end && end < now) return "ongoing";

    if (start && end && start <= now && now <= end) return "progress";

    return "ongoing";
  }

  getProgressPercentage(): number {
    if (this.totalTasks() === 0) return 0;
    return Math.round((this.completedTasks() / this.totalTasks()) * 100);
  }

  formatDate(dateString: string): string {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  getLastTime(task: DisplayTask): string {
    const latestDate = new Date(
      Math.max(new Date(task.createdAt).getTime(), new Date(task.updatedAt).getTime())
    );
    return this.formatDate(latestDate.toISOString());
  }

  navigateToTodos(): void {
    this.router.navigate(["/todos"]);
  }

  navigateToTasks(task: DisplayTask): void {
    this.router.navigate(["/todos", task.todoId, "tasks"]);
  }
}
