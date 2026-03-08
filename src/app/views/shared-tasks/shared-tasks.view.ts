/* sys lib */
import { Component, OnInit, signal, computed, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { CdkDragDrop, DragDropModule, moveItemInArray } from "@angular/cdk/drag-drop";
import { forkJoin } from "rxjs";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Todo } from "@models/todo.model";
import { Profile } from "@models/profile.model";
import { RelationObj, TypesField } from "@models/relation-obj.model";

/* services */
import { NotifyService } from "@services/notify.service";
import { AuthService } from "@services/auth.service";
import { LocalWebSocketService } from "@services/local-websocket.service";
import { TemplateService } from "@services/template.service";
import { StorageService } from "@services/storage.service";

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
  private localWebSocketService = inject(LocalWebSocketService);
  private dataSyncProvider = inject(DataSyncProvider);
  private templateService = inject(TemplateService);
  private storageService = inject(StorageService);

  userId = signal("");

  myProjects = computed(() => {
    const userId = this.userId();
    console.log(this.storageService.sharedTodos());
    return this.storageService
      .sharedTodos()
      .filter((todo) => todo.userId === userId && !todo.isDeleted);
  });

  sharedWithMe = computed(() => {
    const userId = this.userId();
    const profileId = this.storageService.profile()?.id;
    return this.storageService.sharedTodos().filter((todo) => {
      const isNotOwner = todo.userId !== userId;
      const isAssignee = todo.assignees?.some((assignee) => assignee.id === profileId);

      // Show ONLY if it's a team project AND the user is explicitly an assignee
      return isNotOwner && isAssignee && !todo.isDeleted;
    });
  });

  private isUpdatingOrder: boolean = false;

  constructor() {}

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

  async loadSharedProjects() {
    this.storageService.loadTeamTodos().subscribe({
      next: () => {
        // Data updated in storageService.sharedTodos signal
      },
      error: (err) => {
        this.notifyService.showError("Failed to load shared projects");
      },
    });
  }

  todoIsOwner(todo: Todo): boolean {
    return todo.userId === this.userId();
  }

  deleteTodoById(todoId: string, isOwner: boolean): void {
    this.dataSyncProvider.delete("todos", todoId, { isOwner, isPrivate: false }).subscribe({
      next: (result) => {
        this.notifyService.showSuccess("Project deleted successfully");
        // Storage will be updated via loadAllData or manual update if we had optimistic delete for team
        this.storageService.loadAllData(true).subscribe();
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

    const projects = [...this.myProjects()];
    moveItemInArray(projects, event.previousIndex, event.currentIndex);
    this.updateProjectsOrder(projects, true);
  }

  onSharedWithMeDrop(event: CdkDragDrop<Todo[]>): void {
    if (this.isUpdatingOrder) {
      this.notifyService.showWarning("Please wait for previous operation to complete");
      return;
    }

    const projects = [...this.sharedWithMe()];
    moveItemInArray(projects, event.previousIndex, event.currentIndex);
    this.updateProjectsOrder(projects, false);
  }

  updateProjectsOrder(projects: Todo[], isOwner: boolean): void {
    this.isUpdatingOrder = true;

    projects.forEach((todo, index) => {
      todo.order = projects.length - 1 - index;
    });

    const transformedTodos = projects.map((todo) => ({
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
      .updateAll<string>("todos", transformedTodos, { isOwner, isPrivate: false })
      .subscribe({
        next: (result) => {
          this.notifyService.showSuccess("Order updated successfully");
          this.storageService.loadAllData(true).subscribe();
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to update order");
          this.storageService.loadAllData(true).subscribe();
        },
        complete: () => {
          this.isUpdatingOrder = false;
        },
      });
  }
}
