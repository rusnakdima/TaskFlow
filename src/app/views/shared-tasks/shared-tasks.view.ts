/* sys lib */
import { Component, OnInit, signal, computed, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { CdkDragDrop, DragDropModule } from "@angular/cdk/drag-drop";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Todo } from "@models/todo.model";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { TemplateService } from "@services/features/template.service";
import { StorageService } from "@services/core/storage.service";
import { DragDropOrderService } from "@services/ui/drag-drop-order.service";

/* providers */
import { ApiProvider } from "@providers/api.provider";

/* views */
import { BaseListView } from "@views/base-list.view";

/* components */
import { TodoComponent } from "@components/todo/todo.component";

@Component({
  selector: "app-shared-tasks",
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, DragDropModule, TodoComponent],
  templateUrl: "./shared-tasks.view.html",
})
export class SharedTasksView extends BaseListView implements OnInit {
  private authService = inject(AuthService);
  private templateService = inject(TemplateService);
  private storageService = inject(StorageService);
  private dragDropService = inject(DragDropOrderService);
  private apiProvider = inject(ApiProvider);

  userId = signal("");

  myProjects = computed(() => {
    const userId = this.userId();
    return this.storageService
      .sharedTodos()
      .filter((todo) => todo.user_id === userId && !todo.deleted_at);
  });

  sharedWithMe = computed(() => {
    const userId = this.userId();
    return this.storageService.sharedTodos().filter((todo) => {
      const isNotOwner = todo.user_id !== userId;

      const isAssignee =
        todo.assignees?.includes(userId) ||
        todo.assignees?.some((profile: any) => profile.user_id === userId);

      return isNotOwner && isAssignee && !todo.deleted_at;
    });
  });

  override ngOnInit(): void {
    super.ngOnInit();
    const userId = this.authService.getValueByKey("id");
    this.userId.set(userId);
  }

  todoIsOwner(todo: Todo): boolean {
    return todo.user_id === this.userId();
  }

  deleteTodoById(todoId: string, isOwner: boolean): void {
    if (confirm("Are you sure you want to delete this project?")) {
      this.apiProvider.crud("delete", "todos", { id: todoId, visibility: "shared" }).subscribe({
        next: () => {
          this.notifyService.showSuccess("Project deleted successfully");
        },
        error: (err: any) => {
          this.notifyService.showError(err.message || "Failed to delete project");
        },
      });
    }
  }

  onMyProjectsDrop(event: CdkDragDrop<Todo[]>): void {
    this.dragDropService
      .handleDrop(event, this.myProjects(), "todos", "todos", undefined, "shared")
      .subscribe();
  }

  onSharedWithMeDrop(event: CdkDragDrop<Todo[]>): void {
    this.dragDropService
      .handleDrop(event, this.sharedWithMe(), "todos", "todos", undefined, "shared")
      .subscribe();
  }
}
