/* sys lib */
import { Component, OnInit, signal, computed, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { CdkDragDrop, DragDropModule } from "@angular/cdk/drag-drop";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Todo } from "@models/todo.model";

/* helpers */
import { StateHelper } from "@helpers/state.helper";

/* services */
import { NotifyService } from "@services/notify.service";
import { AuthService } from "@services/auth.service";
import { TemplateService } from "@services/template.service";
import { StorageService } from "@services/storage.service";
import { DataSyncService } from "@services/data-sync.service";
import { DragDropOrderService } from "@services/drag-drop-order.service";

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
  private authService = inject(AuthService);
  private notifyService = inject(NotifyService);
  private dataSyncProvider = inject(DataSyncProvider);
  private templateService = inject(TemplateService);
  private storageService = inject(StorageService);
  private dataSyncService = inject(DataSyncService);
  private stateHelper = inject(StateHelper);
  private dragDropService = inject(DragDropOrderService);

  userId = signal("");

  myProjects = computed(() => {
    const userId = this.userId();
    return this.storageService
      .sharedTodos()
      .filter((todo) => todo.userId === userId && !todo.isDeleted);
  });

  sharedWithMe = computed(() => {
    const userId = this.userId();
    return this.storageService.sharedTodos().filter((todo) => {
      const isNotOwner = todo.userId !== userId;
      const isTeam = todo.visibility === "team";

      const isAssignee = todo.assignees?.some((assignee: any) => {
        if (typeof assignee === "string") {
          return assignee === userId;
        } else if (assignee && typeof assignee === "object") {
          return assignee.id === userId || assignee.userId === userId;
        }
        return false;
      });

      return isNotOwner && isAssignee && isTeam && !todo.isDeleted;
    });
  });

  ngOnInit(): void {
    const userId = this.authService.getValueByKey("id");
    this.userId.set(userId);
    this.loadSharedProjects();
  }

  onSaveAsBlueprint(todo: Todo) {
    const name = `${todo.title} Blueprint`;
    const description = todo.description || "";
    this.templateService.createTemplateFromTodo(todo, name, description);
    this.notifyService.showSuccess(`Project saved as "${name}" Blueprint`);
  }

  loadSharedProjects() {
    this.dataSyncService.loadTeamTodos().subscribe();
  }

  todoIsOwner(todo: Todo): boolean {
    return todo.userId === this.userId();
  }

  deleteTodoById(todoId: string, isOwner: boolean): void {
    if (confirm("Are you sure you want to delete this project?")) {
      const todoToDelete = this.storageService.getTodoById(todoId);
      if (todoToDelete) {
        this.stateHelper.deleteOptimistically("todo", todoId, todoToDelete);
        this.notifyService.showSuccess("Project deleted successfully");
      }
    }
  }

  onMyProjectsDrop(event: CdkDragDrop<Todo[]>): void {
    this.dragDropService
      .handleDrop(event, this.myProjects(), "todo", "todos", undefined, {
        isOwner: true,
        isPrivate: false,
      })
      .subscribe();
  }

  onSharedWithMeDrop(event: CdkDragDrop<Todo[]>): void {
    this.dragDropService
      .handleDrop(event, this.sharedWithMe(), "todo", "todos", undefined, {
        isOwner: false,
        isPrivate: false,
      })
      .subscribe();
  }
}
