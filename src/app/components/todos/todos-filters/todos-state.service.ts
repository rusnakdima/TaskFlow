import { Injectable, signal, computed, inject } from "@angular/core";
import { Todo } from "@models/todo.model";
import { StorageService } from "@services/storage.service";
import { FilterHelper } from "@helpers/filter.helper";
import { SortHelper } from "@helpers/sort.helper";

@Injectable({ providedIn: "root" })
export class TodosStateService {
  private storageService = inject(StorageService);

  activeVisibility = signal<"all" | "private" | "shared" | "public">("all");
  statusFilter = signal("all");
  priorityFilter = signal("all");
  searchQuery = signal("");

  private getPrivateTodos(): Todo[] {
    return this.storageService.privateTodos().filter((t: Todo) => !t.deleted_at);
  }

  private getSharedTodos(): Todo[] {
    return this.storageService.sharedTodos().filter((t: Todo) => !t.deleted_at);
  }

  private getPublicTodos(): Todo[] {
    return this.storageService.publicTodos().filter((t: Todo) => !t.deleted_at);
  }

  groupedTodos = computed(() => {
    const privateTodos = this.getPrivateTodos();
    const sharedTodos = this.getSharedTodos();
    const publicTodos = this.getPublicTodos();

    const statusFilter = this.statusFilter();
    const priorityFilter = this.priorityFilter();
    const query = this.searchQuery().toLowerCase().trim();

    const applyFilters = (todos: Todo[]): Todo[] => {
      let filtered = todos;

      if (statusFilter && statusFilter !== "all") {
        switch (statusFilter) {
          case "active":
            filtered = filtered.filter((todo) => !this.isCompleted(todo));
            break;
          case "completed":
            filtered = filtered.filter((todo) => this.isCompleted(todo));
            break;
          case "week":
            filtered = FilterHelper.filterThisWeek(filtered);
            break;
        }
      }

      if (priorityFilter && priorityFilter !== "all") {
        filtered = FilterHelper.filterByPriority(filtered, priorityFilter);
      }

      if (query) {
        filtered = filtered.filter((todo) => todo.title.toLowerCase().includes(query));
      }

      return SortHelper.sortByOrder(filtered, "desc");
    };

    return {
      private: applyFilters(privateTodos),
      shared: applyFilters(sharedTodos),
      public: applyFilters(publicTodos),
    };
  });

  allTodosFlat = computed(() => {
    return [
      ...this.groupedTodos().private,
      ...this.groupedTodos().shared,
      ...this.groupedTodos().public,
    ];
  });

  listTodos = computed(() => {
    const visibility = this.activeVisibility();
    const grouped = this.groupedTodos();

    if (visibility === "all") {
      return this.allTodosFlat();
    } else if (visibility === "private") {
      return grouped.private;
    } else if (visibility === "shared") {
      return grouped.shared;
    } else if (visibility === "public") {
      return grouped.public;
    }
    return [];
  });

  isCompleted(todo: Todo): boolean {
    const listTasks = this.storageService.tasksByTodoId().get(todo.id) || [];
    if (listTasks.length === 0) return false;
    const listCompletedTasks = listTasks.filter(
      (task) => task.status === "completed" || task.status === "skipped"
    );
    return listCompletedTasks.length === listTasks.length;
  }

  getFilteredCount(filter: string): number {
    const visibility = this.activeVisibility();
    let todos: Todo[] = [];

    switch (visibility) {
      case "all":
        todos = this.allTodosFlat();
        break;
      case "private":
        todos = this.getPrivateTodos();
        break;
      case "shared":
        todos = this.getSharedTodos();
        break;
      case "public":
        todos = this.getPublicTodos();
        break;
    }

    switch (filter) {
      case "all":
        return todos.length;
      case "active":
        return todos.filter((todo) => !this.isCompleted(todo)).length;
      case "completed":
        return todos.filter((todo) => this.isCompleted(todo)).length;
      case "week":
        return FilterHelper.filterThisWeek(todos).length;
      case "low":
      case "medium":
      case "high":
      case "urgent":
        return FilterHelper.filterByPriority(todos, filter).length;
      default:
        return 0;
    }
  }
}
