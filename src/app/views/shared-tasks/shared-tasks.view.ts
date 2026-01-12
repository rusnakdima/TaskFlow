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
import { WebSocketService } from "@services/websocket.service";
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
  providers: [MainService, WebSocketService, DataSyncProvider],
  imports: [CommonModule, RouterModule, MatIconModule, DragDropModule, TodoComponent],
  templateUrl: "./shared-tasks.view.html",
})
export class SharedTasksView implements OnInit {
  constructor(
    private authService: AuthService,
    private mainService: MainService,
    private notifyService: NotifyService,
    private webSocketService: WebSocketService,
    private dataSyncProvider: DataSyncProvider
  ) {}

  myProjects = signal<Todo[]>([]);
  sharedWithMe = signal<Todo[]>([]);

  ngOnInit(): void {
    this.loadSharedProjects();
    this.listenForUpdates();
  }

  private listenForUpdates(): void {
    const userId = this.authService.getValueByKey("id");
    this.webSocketService.onTodoCreated().subscribe((todo: Todo) => {
      if (todo.userId === userId && todo.visibility === "team") {
        this.myProjects.update((todos) => [...todos, todo]);
      } else if (todo.userId !== userId) {
        this.sharedWithMe.update((todos) => [...todos, todo]);
      }
    });
    this.webSocketService.onTodoUpdated().subscribe((updatedTodo: Todo) => {
      if (updatedTodo.userId === userId && updatedTodo.visibility === "team") {
        this.myProjects.update((todos) => {
          const index = todos.findIndex((t) => t.id === updatedTodo.id);
          if (index !== -1) {
            todos[index] = updatedTodo;
            return [...todos];
          } else {
            return [...todos, updatedTodo];
          }
        });
      } else if (updatedTodo.userId === userId && updatedTodo.visibility !== "team") {
        this.myProjects.update((todos) => todos.filter((t) => t.id !== updatedTodo.id));
      } else if (updatedTodo.userId !== userId) {
        this.sharedWithMe.update((todos) => {
          const index = todos.findIndex((t) => t.id === updatedTodo.id);
          if (index !== -1) {
            todos[index] = updatedTodo;
          }
          return [...todos];
        });
      }
    });
    this.webSocketService.onTodoDeleted().subscribe((id: string) => {
      this.myProjects.update((todos) => todos.filter((t) => t.id !== id));
      this.sharedWithMe.update((todos) => todos.filter((t) => t.id !== id));
    });
  }

  async fetchProfile(userId: string): Promise<Profile | null> {
    const response: Response<Profile> = await this.mainService.getByField<Profile>(
      "profile",
      "userId",
      userId
    );

    if (response.status !== ResponseStatus.SUCCESS) return null;
    const profile = response.data;
    return profile;
  }

  async loadSharedProjects() {
    const userId = this.authService.getValueByKey("id");
    if (userId) {
      // According to diagram: Shared page → MongoDB for accessible team todos
      this.dataSyncProvider.getAll<Todo>("todo", { queryType: "shared", userId }).subscribe({
        next: (todos) => {
          // Split into my shared projects and shared with me
          const myShared = todos.filter(
            (todo) => todo.userId === userId && todo.visibility === "team"
          );
          const sharedWithMe = todos.filter((todo) => todo.userId !== userId);

          this.myProjects.set(myShared);
          this.sharedWithMe.set(sharedWithMe);
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Error loading shared projects");
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

  inviteMember(): void {
    this.notifyService.showSuccess("Invite functionality would be implemented here");
  }

  createProject(): void {
    this.notifyService.showInfo("Project creation form would open here");
  }

  // Removed drag and drop for now, as we have separate lists
  // onTodoDrop(event: CdkDragDrop<Todo[]>): void {
  //   // Handle for specific list if needed
  // }
}
