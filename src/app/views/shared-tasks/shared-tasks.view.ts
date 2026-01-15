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
  providers: [MainService, DataSyncProvider],
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

  private waitForWebSocketConnection(): void {
    const connectionTimeout = 5000; // 5 seconds timeout

    this.webSocketService.getConnectionStatus().subscribe((connected) => {
      if (connected) {
        console.log("WebSocket connected, loading shared projects via WS");
        this.loadSharedProjects();
      }
    });

    // If WS doesn't connect within timeout, fall back to HTTP
    setTimeout(() => {
      if (!this.webSocketService.isConnected()) {
        console.log("WebSocket not connected within timeout, loading shared projects via HTTP");
        this.loadSharedProjects();
      }
    }, connectionTimeout);
  }

  private listenForUpdates(): void {
    // TODO: Implement real-time updates for shared todos
    // WebSocket event listeners have been removed as the service now uses Tauri invoke
    console.log("Real-time updates for shared todos are not implemented yet");
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
        .getAll<Todo>("todo", { userId }, { isOwner: true, isPrivate: false })
        .subscribe({
          next: (todos) => {
            let listTodos = todos.filter((todo: Todo) => todo.userId == userId);
            this.myProjects.set(listTodos);
          },
          error: (err) => {
            this.notifyService.showError(err.message || "Error loading my shared projects");
          },
        });

      this.dataSyncProvider
        .getAll<Todo>("todo", {}, { isOwner: false, isPrivate: false })
        .subscribe({
          next: (todos) => {
            let listTodos = todos.filter((todo: Todo) => todo.userId != userId);
            this.sharedWithMe.set(listTodos);
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
}
