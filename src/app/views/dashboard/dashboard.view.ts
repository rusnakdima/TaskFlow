/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { Router, RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Response, ResponseStatus } from "@models/response";
import { Todo } from "@models/todo";
import { Task } from "@models/task";

/* services */
import { MainService } from "@services/main.service";
import { NotifyService } from "@services/notify.service";
import { AuthService } from "@services/auth.service";

interface DisplayTask {
  id: string;
  title: string;
  description: string;
  status: string;
  dueDate: string;
  createdAt: string;
  todoId: string;
}

@Component({
  selector: "app-dashboard",
  standalone: true,
  providers: [MainService, NotifyService],
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: "./dashboard.view.html",
})
export class DashboardView implements OnInit {
  constructor(
    private authService: AuthService,
    private mainService: MainService,
    private notifyService: NotifyService,
    private router: Router
  ) {}

  totalTasks: number = 0;
  completedTasks: number = 0;
  inProgressTasks: number = 0;
  overdueTasks: number = 0;

  allTasks: Array<DisplayTask> = [];
  filteredTasks: Array<DisplayTask> = [];

  recentActivities: Array<string> = [];

  ngOnInit(): void {
    this.loadDashboardData();
  }

  loadDashboardData(): void {
    const userId: string = this.authService.getValueByKey("id");

    if (userId && userId !== "") {
      this.mainService
        .getAllByField<Array<Todo>>("todo", "userId", userId)
        .then((response: Response<Array<Todo>>) => {
          if (response.status === ResponseStatus.SUCCESS) {
            this.processTodosData(response.data);
          } else {
            this.notifyService.showError(response.message);
          }
        })
        .catch((err: Response<string>) => {
          this.notifyService.showError(err.message);
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
    this.totalTasks = tasks.length;

    const now = new Date();

    this.completedTasks = tasks.filter((task) => task.isCompleted).length;
    this.inProgressTasks = tasks.filter((task) => {
      if (task.isCompleted) return false;
      const start = task.startDate ? new Date(task.startDate) : null;
      const end = task.endDate ? new Date(task.endDate) : null;
      return start && end && start <= now && now <= end;
    }).length;
    this.overdueTasks = tasks.filter((task) => {
      if (task.isCompleted) return false;
      const end = task.endDate ? new Date(task.endDate) : null;
      return end && end < now;
    }).length;

    this.allTasks = taskData
      .map((item) => ({
        id: item.task.id,
        title: item.task.title,
        description: item.task.description,
        status: this.getTaskStatus(item.task),
        dueDate: item.task.endDate,
        createdAt: item.task.createdAt,
        todoId: item.todoId,
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Generate recent activities
    const sortedTasks = [...tasks].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    this.recentActivities = sortedTasks.slice(0, 4).map((task) => {
      if (task.isCompleted) {
        return `Completed task: ${task.title}`;
      } else {
        return `Created task: ${task.title}`;
      }
    });

    this.filteredTasks = this.allTasks;
  }

  getTaskStatus(task: Task): string {
    if (task.isCompleted) return "completed";

    const now = new Date();
    const start = task.startDate ? new Date(task.startDate) : null;
    const end = task.endDate ? new Date(task.endDate) : null;

    if (end && end < now) return "ongoing"; // overdue, but since overdue is separate, perhaps ongoing for not started

    if (start && end && start <= now && now <= end) return "progress";

    return "ongoing";
  }

  getProgressPercentage(): number {
    if (this.totalTasks === 0) return 0;
    return Math.round((this.completedTasks / this.totalTasks) * 100);
  }

  formatDate(dateString: string): string {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  navigateToTodos(): void {
    this.router.navigate(["/todos"]);
  }

  navigateToTasks(task: DisplayTask): void {
    this.router.navigate(["/todos", task.todoId, "tasks"]);
  }
}
