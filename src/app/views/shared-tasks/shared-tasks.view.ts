/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal } from "@angular/core";
import { RouterModule } from "@angular/router";
import { CdkDragDrop, DragDropModule, moveItemInArray } from "@angular/cdk/drag-drop";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Response, ResponseStatus } from "@models/response.model";
import { Todo } from "@models/todo.model";
import { Profile } from "@models/profile.model";

/* services */
import { MainService } from "@services/main.service";
import { NotifyService } from "@services/notify.service";
import { AuthService } from "@services/auth.service";
import { DataSyncProvider } from "@services/data-sync.provider";

/* components */
import { TodoComponent } from "@components/todo/todo.component";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  tasksCompleted: number;
  tasksAssigned: number;
}

@Component({
  selector: "app-shared-tasks",
  standalone: true,
  providers: [MainService, DataSyncProvider],
  imports: [CommonModule, RouterModule, MatIconModule, DragDropModule, TodoComponent],
  templateUrl: "./shared-tasks.view.html",
})
export class SharedTasksView implements OnInit {
  constructor(
    private authService: AuthService,
    private mainService: MainService,
    private notifyService: NotifyService,
    private dataSyncProvider: DataSyncProvider
  ) {}

  myProjects = signal<Todo[]>([]);
  sharedWithMe = signal<Todo[]>([]);

  private isUpdatingOrder: boolean = false;

  ngOnInit(): void {
    this.loadSharedProjects();
    this.listenForRealTimeUpdates();
  }

  private listenForRealTimeUpdates(): void {
    window.addEventListener("ws-todo-created", () => this.loadSharedProjects());
    window.addEventListener("ws-todo-updated", () => this.loadSharedProjects());
    window.addEventListener("ws-todo-deleted", () => this.loadSharedProjects());
  }

  async fetchProfile(userId: string): Promise<Profile | null> {
    const response: Response<Profile> = await this.mainService.get<Profile>("profile", {
      userId,
    });

    if (response.status !== ResponseStatus.SUCCESS) return null;
    const profile = response.data;
    return profile;
  }

  async loadSharedProjects() {
    const userId = this.authService.getValueByKey("id");
    if (userId) {
      this.dataSyncProvider
        .getAll<Todo>("todo", { userId, visibility: "team" }, { isOwner: true, isPrivate: false })
        .subscribe({
          next: (todos) => {
            if (todos) {
              let listTodos = todos.filter((todo: Todo) => todo.userId == userId);
              this.myProjects.set(listTodos);
            }
          },
          error: (err) => {
            this.notifyService.showError(err.message || "Error loading my shared projects");
          },
        });

      this.dataSyncProvider
        .getAll<Todo>(
          "todo",
          { assignee: userId, visibility: "team" },
          { isOwner: false, isPrivate: false }
        )
        .subscribe({
          next: (todos) => {
            if (todos) {
              let listTodos = todos.filter((todo: Todo) => todo.userId != userId);
              this.sharedWithMe.set(listTodos);
            }
          },
          error: (err) => {
            this.notifyService.showError(err.message || "Error loading projects shared with me");
          },
        });
    }
  }

  getProgressColor(progress: number): string {
    if (progress >= 80) return "bg-green-500";
    if (progress >= 50) return "bg-blue-500";
    if (progress >= 25) return "bg-yellow-500";
    return "bg-red-500";
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  getCompletionRate(member: TeamMember): number {
    if (member.tasksAssigned === 0) return 0;
    return Math.round((member.tasksCompleted / member.tasksAssigned) * 100);
  }

  getMemberInitials(name: string): string {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  }

  todoIsOwner(todo: Todo): boolean {
    return todo.userId === this.authService.getValueByKey("id");
  }

  inviteMember(): void {
    this.notifyService.showSuccess("Invite functionality would be implemented here");
  }

  createProject(): void {
    this.notifyService.showInfo("Project creation form would open here");
  }

  onMyProjectsDrop(event: CdkDragDrop<Todo[]>): void {
    if (this.isUpdatingOrder) {
      this.notifyService.showWarning("Please wait for previous operation to complete");
      return;
    }

    moveItemInArray(this.myProjects(), event.previousIndex, event.currentIndex);
    this.updateMyProjectsOrder();
  }

  onSharedWithMeDrop(event: CdkDragDrop<Todo[]>): void {
    if (this.isUpdatingOrder) {
      this.notifyService.showWarning("Please wait for previous operation to complete");
      return;
    }

    moveItemInArray(this.sharedWithMe(), event.previousIndex, event.currentIndex);
    this.updateSharedWithMeOrder();
  }

  updateMyProjectsOrder(): void {
    this.isUpdatingOrder = true;

    this.myProjects().forEach((todo, index) => {
      todo.order = this.myProjects().length - 1 - index;
    });

    const transformedTodos = this.myProjects().map((todo) => ({
      _id: todo._id,
      id: todo.id,
      userId: todo.userId || "",
      title: todo.title,
      description: todo.description,
      startDate: todo.startDate,
      endDate: todo.endDate,
      categories: todo.categories?.map((cat) => cat.id) || [],
      assignees: todo.assignees?.map((assignee) => assignee.id) || [],
      visibility: todo.visibility,
      order: todo.order,
      isDeleted: todo.isDeleted,
      createdAt: todo.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString().split(".")[0],
    }));

    this.dataSyncProvider
      .updateAll<string>("todo", transformedTodos, { isOwner: true, isPrivate: false })
      .subscribe({
        next: (result) => {
          this.notifyService.showSuccess("Order updated successfully");
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to update order");
          this.loadSharedProjects();
        },
        complete: () => {
          this.isUpdatingOrder = false;
        },
      });
  }

  updateSharedWithMeOrder(): void {
    this.isUpdatingOrder = true;

    this.sharedWithMe().forEach((todo, index) => {
      todo.order = this.sharedWithMe().length - 1 - index;
    });

    const transformedTodos = this.sharedWithMe().map((todo) => ({
      _id: todo._id,
      id: todo.id,
      userId: todo.userId || "",
      title: todo.title,
      description: todo.description,
      startDate: todo.startDate,
      endDate: todo.endDate,
      categories: todo.categories?.map((cat) => cat.id) || [],
      assignees: todo.assignees?.map((assignee) => assignee.id) || [],
      visibility: todo.visibility,
      order: todo.order,
      isDeleted: todo.isDeleted,
      createdAt: todo.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString().split(".")[0],
    }));

    this.dataSyncProvider
      .updateAll<string>("todo", transformedTodos, { isOwner: false, isPrivate: false })
      .subscribe({
        next: (result) => {
          this.notifyService.showSuccess("Order updated successfully");
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to update order");
          this.loadSharedProjects();
        },
        complete: () => {
          this.isUpdatingOrder = false;
        },
      });
  }
}
