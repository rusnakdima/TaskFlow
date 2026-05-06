/* sys lib */
import { Component, OnInit, signal, computed, inject, DestroyRef } from "@angular/core";
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
  private templateService = inject(TemplateService);
  protected override storageService = inject(StorageService);
  private dragDropService = inject(DragDropOrderService);
  private apiProvider = inject(ApiProvider);
  private destroyRef = inject(DestroyRef);

  protected getItems(): { id: string }[] {
    return [];
  }

  userId = signal("");
  sharedTodosList = computed(() => this.storageService.sharedTodos());

  myProjects = computed(() => {
    const userId = this.userId();
    return this.sharedTodosList().filter((todo) => todo.user_id === userId && !todo.deleted_at);
  });

  sharedWithMe = computed(() => {
    const userId = this.userId();
    return this.sharedTodosList().filter((todo) => {
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
      this.storageService.removeTodoWithCascade(todoId);
      this.notifyService.showSuccess("Project deleted successfully");
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
