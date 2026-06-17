import { signal, inject, computed } from "@angular/core";
import { ApiService } from "@services/api.service";
import { EntityStoreService } from "@core/services/entity-store.service";
import { AuthService } from "@services/auth/auth.service";
import { NotifyService } from "@services/notifications/notify.service";
import { Visibility } from "@services/api.service";
import { Task } from "@models/generated/api.types";
import { Todo } from "@models/generated/api.types";

export interface TaskPaginationState {
  skip: number;
  limit: number;
  total: number;
  hasMore: boolean;
  loading: boolean;
}

export class TasksPaginationState {
  private apiService = inject(ApiService);
  private entityStore = inject(EntityStoreService);
  private authService = inject(AuthService);
  private notifyService = inject(NotifyService);

  taskPagination = signal<TaskPaginationState>({
    skip: 0,
    limit: 10,
    total: 0,
    hasMore: true,
    loading: false,
  });

  todoTasks = signal<Task[]>([]);
  allTasksForTodo = computed(() => this.todoTasks());

  loadInitialTasks(
    forceRefresh = false,
    visibilityOverride?: string,
    todo?: Todo | null,
    todoId?: string | null,
    visibilityParam?: Visibility,
    entityStore?: EntityStoreService
  ): void {
    const currentTodoId = todoId || this.todoTasks()[0]?.todo_id;
    if (!currentTodoId) return;

    const cachedTasks = (entityStore || this.entityStore).tasksByTodoId().get(currentTodoId) || [];

    if (cachedTasks.length > 0 && !forceRefresh && !visibilityOverride) {
      const storedTotal = this.taskPagination().total;
      if (storedTotal > 0 && cachedTasks.length >= storedTotal) {
        this.todoTasks.set(cachedTasks);
        this.taskPagination.update((p) => ({
          ...p,
          skip: cachedTasks.length,
          total: storedTotal,
          hasMore: false,
          loading: false,
        }));
        return;
      }
    }

    this.taskPagination.update((p) => ({ ...p, loading: true }));
    const visibility = visibilityOverride || todo?.visibility || visibilityParam;
    const userId = (entityStore || this.entityStore).currentUserId();

    (entityStore || this.apiService).tasks
      .getAll({
        visibility,
        limit: 25,
        filter: { todo_id: currentTodoId, $or: [{ user_id: userId }, { assignees: userId }] },
      })
      .subscribe({
        next: (tasks) => {
          this.todoTasks.set(tasks);
          this.taskPagination.update((p) => ({
            ...p,
            skip: tasks.length,
            total: tasks.length,
            hasMore: tasks.length >= 25,
            loading: false,
          }));
        },
        error: () => {
          this.taskPagination.update((p) => ({ ...p, loading: false }));
          this.notifyService.showError("Failed to load tasks");
        },
      });
  }

  loadMoreTasks(
    todoId?: string | null,
    todo?: Todo | null,
    visibilityParam?: Visibility,
    entityStore?: EntityStoreService
  ): void {
    if (this.taskPagination().loading || !this.taskPagination().hasMore) return;
    const currentTodoId = todoId || this.todoTasks()[0]?.todo_id;
    if (!currentTodoId) return;
    const visibility = todo?.visibility || visibilityParam;
    const userId = (entityStore || this.entityStore).currentUserId();
    (entityStore || this.entityStore).loadMoreTasks(currentTodoId, visibility, userId, userId);
  }

  updateTodoTasks(fn: (tasks: Task[]) => Task[]): void {
    this.todoTasks.update(fn);
  }
}
