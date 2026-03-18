/* sys lib */
import { Component, OnInit, OnDestroy, signal, computed, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { CdkDragDrop, DragDropModule } from "@angular/cdk/drag-drop";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Todo } from "@models/todo.model";

/* services */
import { NotifyService } from "@services/notifications/notify.service";
import { AuthService } from "@services/auth/auth.service";
import { TemplateService } from "@services/features/template.service";
import { StorageService } from "@services/core/storage.service";
import { DataSyncService } from "@services/data/data-sync.service";
import { DragDropOrderService } from "@services/ui/drag-drop-order.service";

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
export class SharedTasksView implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private notifyService = inject(NotifyService);
  private dataSyncProvider = inject(DataSyncProvider);
  private templateService = inject(TemplateService);
  private storageService = inject(StorageService);
  private dataSyncService = inject(DataSyncService);
  private dragDropService = inject(DragDropOrderService);

  userId = signal("");
  isOffline = signal(false);
  private onOnline = () => this.isOffline.set(false);
  private onOffline = () => this.isOffline.set(true);

  myProjects = computed(() => {
    const userId = this.userId();
    // Only show team projects where user is the owner
    return this.storageService
      .sharedTodos()
      .filter((todo) => todo.userId === userId && !todo.isDeleted);
  });

  sharedWithMe = computed(() => {
    const userId = this.userId();
    // Only show team projects where user is NOT the owner but is an assignee
    return this.storageService.sharedTodos().filter((todo) => {
      const isNotOwner = todo.userId !== userId;

      const isAssignee =
        todo.assignees?.includes(userId) ||
        todo.assigneesProfiles?.some((profile) => profile.userId === userId);

      return isNotOwner && isAssignee && !todo.isDeleted;
    });
  });

  ngOnInit(): void {
    const userId = this.authService.getValueByKey("id");
    this.userId.set(userId);
    this.bindOfflineListeners();
    this.loadSharedProjects();
  }

  ngOnDestroy(): void {
    this.unbindOfflineListeners();
  }

  private bindOfflineListeners(): void {
    if (typeof navigator === "undefined") return;
    window.addEventListener("online", this.onOnline);
    window.addEventListener("offline", this.onOffline);
    this.isOffline.set(!navigator.onLine);
  }

  private unbindOfflineListeners(): void {
    window.removeEventListener("online", this.onOnline);
    window.removeEventListener("offline", this.onOffline);
  }

  loadSharedProjects() {
    this.dataSyncService.loadTeamTodos().subscribe();
  }

  todoIsOwner(todo: Todo): boolean {
    return todo.userId === this.userId();
  }

  deleteTodoById(todoId: string, isOwner: boolean): void {
    if (confirm("Are you sure you want to delete this project?")) {
      this.dataSyncProvider
        .crud("delete", "todos", { id: todoId, isOwner: true, isPrivate: false })
        .subscribe({
          next: () => {
            this.notifyService.showSuccess("Project deleted successfully");
            // No need to reload - storage is already updated by archiveTodoWithCascade()
          },
          error: (err) => {
            this.notifyService.showError(err.message || "Failed to delete project");
          },
        });
    }
  }

  onMyProjectsDrop(event: CdkDragDrop<Todo[]>): void {
    this.dragDropService
      .handleDrop(event, this.myProjects(), "todos", "todos", undefined, {
        isOwner: true,
        isPrivate: false,
      })
      .subscribe();
  }

  onSharedWithMeDrop(event: CdkDragDrop<Todo[]>): void {
    this.dragDropService
      .handleDrop(event, this.sharedWithMe(), "todos", "todos", undefined, {
        isOwner: false,
        isPrivate: false,
      })
      .subscribe();
  }
}
