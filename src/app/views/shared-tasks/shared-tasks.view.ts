/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal } from "@angular/core";
import { RouterModule } from "@angular/router";
import { CdkDragDrop, DragDropModule, moveItemInArray } from "@angular/cdk/drag-drop";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Todo } from "@models/todo.model";
import { Profile } from "@models/profile.model";

/* services */
import { NotifyService } from "@services/notify.service";
import { AuthService } from "@services/auth.service";
import { LocalWebSocketService } from "@services/local-websocket.service";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

/* components */
import { TodoComponent } from "@components/todo/todo.component";

@Component({
  selector: "app-shared-tasks",
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, DragDropModule, TodoComponent],
  templateUrl: "./shared-tasks.view.html",
})
export class SharedTasksView implements OnInit {
  constructor(
    private authService: AuthService,
    private notifyService: NotifyService,
    private localWebSocketService: LocalWebSocketService,
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
    return new Promise((resolve) => {
      this.dataSyncProvider.get<Profile>("profiles", { userId }).subscribe({
        next: (profile) => {
          resolve(profile);
        },
        error: () => {
          resolve(null);
        },
      });
    });
  }

  async loadSharedProjects() {
    const userId = this.authService.getValueByKey("id");
    if (!userId) return;

    // Use WebSocket to load team todos from MongoDB if connected
    if (this.localWebSocketService.isConnected()) {
      // Load my projects (team todos where I am owner)
      this.localWebSocketService
        .getAll<Todo>(
          "todos",
          { userId, visibility: "team", isDeleted: false },
          { isOwner: true, isPrivate: false }
        )
        .subscribe({
          next: (todos) => {
            if (todos) {
              this.myProjects.set(todos);
            }
          },
          error: (err) => {
            this.notifyService.showError(err.message || "Error loading my shared projects");
          },
        });

      // Load shared with me (team todos where I am assignee but not owner)
      this.localWebSocketService
        .getAll<Todo>(
          "todos",
          { assignees: userId, visibility: "team", isDeleted: false },
          { isOwner: false, isPrivate: false }
        )
        .subscribe({
          next: (todos) => {
            if (todos) {
              const sharedTodos = todos.filter((todo: Todo) => todo.userId !== userId);
              this.sharedWithMe.set(sharedTodos);
            }
          },
          error: (err) => {
            this.notifyService.showError(err.message || "Error loading projects shared with me");
          },
        });
    } else {
      // Fallback to regular provider if WebSocket not connected
      this.dataSyncProvider
        .getAll<Todo>(
          "todos",
          { userId, visibility: "team", isDeleted: false },
          { isOwner: true, isPrivate: false }
        )
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
          "todos",
          { assignees: userId, visibility: "team", isDeleted: false },
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

  todoIsOwner(todo: Todo): boolean {
    return todo.userId === this.authService.getValueByKey("id");
  }

  deleteTodoById(todoId: string, isOwner: boolean): void {
    this.dataSyncProvider.delete("todos", todoId, { isOwner, isPrivate: false }).subscribe({
      next: (result) => {
        this.notifyService.showSuccess("Project deleted successfully");
        this.loadSharedProjects();
      },
      error: (err) => {
        this.notifyService.showError(err.message || "Failed to delete project");
      },
    });
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
      .updateAll<string>("todos", transformedTodos, { isOwner: true, isPrivate: false })
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
      .updateAll<string>("todos", transformedTodos, { isOwner: false, isPrivate: false })
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
