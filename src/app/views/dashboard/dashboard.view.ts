/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal, effect, inject, computed } from "@angular/core";
import { Router, RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";
import { Profile } from "@models/profile.model";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { StorageService } from "@services/core/storage.service";

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

  // ✅ FIX: Use computed signal from StorageService instead of making API call
  profile = computed(() => this.storageService.profile());

  totalTasks = signal(0);
  completedTasks = signal(0);
  inProgressTasks = signal(0);
  overdueTasks = signal(0);

  allTasks = signal<DisplayTask[]>([]);
  filteredTasks = signal<DisplayTask[]>([]);

  recentActivities = signal<{ text: string; status: TaskStatus }[]>([]);

  userId = "";

  constructor(
    private authService: AuthService,
    private storageService: StorageService,
    private router: Router
  ) {
    // Watch for todos data changes and process when data is loaded
    effect(() => {
      const todos = this.storageService.todos();
      if (todos.length > 0) {
        this.processTodosData(todos);
      }
    });
  }

  ngOnInit(): void {
    this.userId = this.authService.getValueByKey("id");

    // ✅ FIX: NO API CALL NEEDED - profile already loaded in StorageService by DataLoaderService
    // Just use the computed signal - it will update automatically when data is loaded
  }

  processTodosData(todos: Array<Todo>): void {
    // Map tasks from all todos
    const allTasks: { task: Task; todo: Todo }[] = [];
    todos.forEach((todo) => {
      if (Array.isArray(todo.tasks)) {
        todo.tasks.forEach((task) => {
          allTasks.push({ task, todo });
        });
      }
    });

    this.processTaskData(allTasks);
  }

  processTaskData(taskData: Array<{ task: Task; todo: Todo }>): void {
    // Filter out deleted tasks and deleted todos
    const activeTaskData = taskData.filter(
      (item) => !item.task.deleted_at && !item.todo.deleted_at
    );
    const tasks = activeTaskData.map((item) => item.task);
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
        const start = task.start_date ? new Date(task.start_date) : null;
        const end = task.end_date ? new Date(task.end_date) : null;
        return start && end && start <= now && now <= end;
      }).length
    );
    this.overdueTasks.set(
      tasks.filter((task) => {
        if (task.status !== TaskStatus.PENDING && task.status !== TaskStatus.FAILED) return false;
        const end = task.end_date ? new Date(task.end_date) : null;
        return end && end < now;
      }).length
    );

    const newAllTasks = activeTaskData
      .map((item) => ({
        id: item.task.id,
        title: item.task.title,
        description: item.task.description,
        status: item.task.status,
        dueDate: item.task.end_date,
        created_at: item.task.created_at,
        updated_at: item.task.updated_at,
        todo_id: item.todo.id,
        isPrivate: item.todo.visibility === "private",
        isOwner: item.todo.user_id === this.userId,
      }))
      .sort((a, b) => {
        const aTime = Math.max(new Date(a.created_at).getTime(), new Date(a.updated_at).getTime());
        const bTime = Math.max(new Date(b.created_at).getTime(), new Date(b.updated_at).getTime());
        return bTime - aTime;
      });

    this.allTasks.set(newAllTasks);

    const sortedTasks = [...tasks].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    this.recentActivities.set(
      sortedTasks.slice(0, 4).map((task) => {
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
      })
    );

    this.filteredTasks.set(newAllTasks.slice(0, 10));
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
    if (this.totalTasks() === 0) return 0;
    return Math.round((this.completedTasks() / this.totalTasks()) * 100);
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
