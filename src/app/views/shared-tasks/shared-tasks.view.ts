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
import { DataService } from "@services/data/data.service";
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
  private dataService = inject(DataService);
  private dragDropService = inject(DragDropOrderService);
  private apiProvider = inject(ApiProvider);
  private destroyRef = inject(DestroyRef);

  protected getItems(): { id: string }[] {
    return [];
  }

  userId = signal("");
  private sharedTodosList: Todo[] = [];

  myProjects = computed(() => {
    const userId = this.userId();
    return this.sharedTodosList.filter((todo) => todo.user_id === userId && !todo.deleted_at);
  });

  sharedWithMe = computed(() => {
    const userId = this.userId();
    return this.sharedTodosList.filter((todo) => {
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

    const sharedTodosSub = this.dataService.todos$.subscribe((todos) => {
      this.sharedTodosList = todos.filter((t) => t.visibility === "shared");
    });
    this.destroyRef.onDestroy(() => sharedTodosSub.unsubscribe());
  }

  todoIsOwner(todo: Todo): boolean {
    return todo.user_id === this.userId();
  }

  deleteTodoById(todoId: string, isOwner: boolean): void {
    if (confirm("Are you sure you want to delete this project?")) {
      const sub = this.dataService.deleteTodo(todoId).subscribe({
        next: () => {
          this.notifyService.showSuccess("Project deleted successfully");
        },
        error: (err: any) => {
          this.notifyService.showError(err.message || "Failed to delete project");
        },
      });
      this.destroyRef.onDestroy(() => sub.unsubscribe());
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
