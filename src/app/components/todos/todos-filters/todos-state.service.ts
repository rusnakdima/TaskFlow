import { Injectable, signal, computed, inject } from "@angular/core";
import { Todo } from "@entities/generated/api.types";
import { StorageService } from "@services/storage.service";
import { FilterHelper } from "@helpers/filter.helper";
import { SortHelper } from "@helpers/sort.helper";
import { SearchService } from "@core/services/search.service";
import { EntityStoreService } from "@core/services/entity-store.service";
import { FilterField } from "@entities/filter-config.model";

@Injectable({ providedIn: "root" })
export class TodosStateService {
  private storageService = inject(StorageService);
  private searchService = inject(SearchService);
  private entityStore = inject(EntityStoreService);

  activeVisibility = signal<"all" | "private" | "shared" | "public">("all");
  statusFilter = signal("all");
  priorityFilter = signal("all");
  searchQuery = signal("");

  highlightTodoId = signal<string | null>(null);
  showStats = signal(false);

  visibilityOptions = computed(() => [
    { id: "all", label: "All", icon: "apps", count: this.allTodosFlat().length },
    {
      id: "private",
      label: "Private",
      icon: "lock",
      count: this.entityStore.privateTodos().length,
    },
    {
      id: "shared",
      label: "Shared",
      icon: "group",
      count: this.entityStore.sharedTodos().length,
    },
    {
      id: "public",
      label: "Public",
      icon: "public",
      count: this.entityStore.publicTodos().length,
    },
  ]);

  filterFields: FilterField[] = [
    {
      key: "status",
      label: "Status",
      type: "radio",
      options: [
        { key: "all", label: "All" },
        { key: "active", label: "Active" },
        { key: "completed", label: "Completed" },
        { key: "week", label: "This Week" },
      ],
    },
    {
      key: "priority",
      label: "Priority",
      type: "radio",
      options: [
        { key: "all", label: "All" },
        { key: "low", label: "Low" },
        { key: "medium", label: "Medium" },
        { key: "high", label: "High" },
        { key: "urgent", label: "Urgent" },
      ],
    },
  ];

  onSearchChange(query: string): void {
    this.searchQuery.set(query);
    this.searchService.search("todos", query);
  }

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

    if (query) {
      const searchResults = this.searchService.todosResults();
      if (searchResults.length > 0) {
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

          return SortHelper.sortByOrder(filtered, "desc");
        };

        return {
          private: applyFilters(searchResults.filter((t: Todo) => t.visibility === "private")),
          shared: applyFilters(searchResults.filter((t: Todo) => t.visibility === "shared")),
          public: applyFilters(searchResults.filter((t: Todo) => t.visibility === "public")),
        };
      }
    }

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
