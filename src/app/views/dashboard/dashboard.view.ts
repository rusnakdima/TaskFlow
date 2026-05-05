/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, inject, signal, computed, DestroyRef } from "@angular/core";
import { Router, RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";
import { Profile } from "@models/profile.model";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { DataService } from "@services/data/data.service";

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
  private dataService = inject(DataService);
  private destroyRef = inject(DestroyRef);
  private router = inject(Router);

  profile = signal<Profile | null>(null);
  userId = "";

  private allTasksData = signal<DisplayTask[]>([]);

  private todos = signal<Todo[]>([]);
  private tasks = signal<Task[]>([]);

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

  ngOnInit(): void {
    this.userId = this.authService.getValueByKey("id");

    const todoSub = this.dataService.todos$.subscribe((todos) => {
      this.todos.set(todos);
      this.updateTasksData();
    });
    this.destroyRef.onDestroy(() => todoSub.unsubscribe());

    const taskSub = this.dataService.tasks$.subscribe((tasks) => {
      this.tasks.set(tasks);
      this.updateTasksData();
    });
    this.destroyRef.onDestroy(() => taskSub.unsubscribe());

    const profileSub = this.dataService.profile$.subscribe((profile) => {
      this.profile.set(profile);
    });
    this.destroyRef.onDestroy(() => profileSub.unsubscribe());

    this.dataService.getTodos({ visibility: "all" }).subscribe();
    this.dataService.getTasks().subscribe();
    this.dataService.getProfile().subscribe();
  }

  private updateTasksData(): void {
    const userId = this.userId;
    const currentTodos = this.todos();
    const currentTasks = this.tasks();

    const taskData: { task: Task; todo: Todo }[] = [];
    currentTodos.forEach((todo) => {
      if (!todo.deleted_at) {
        const tasksForTodo = currentTasks.filter((t) => t.todo_id === todo.id);
        tasksForTodo.forEach((task) => {
          if (!task.deleted_at) {
            taskData.push({ task, todo });
          }
        });
      }
    });

    const mappedTasks = taskData
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
        isOwner: item.todo.user_id === userId,
      }))
      .sort((a, b) => {
        const aTime = Math.max(new Date(a.created_at).getTime(), new Date(a.updated_at).getTime());
        const bTime = Math.max(new Date(b.created_at).getTime(), new Date(b.updated_at).getTime());
        return bTime - aTime;
      });

    this.allTasksData.set(mappedTasks);
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
