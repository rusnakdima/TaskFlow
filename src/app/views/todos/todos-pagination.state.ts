import { Injectable, signal, inject } from "@angular/core";
import { EntityStoreService } from "@core/services/entity-store.service";

export interface TodoPagination {
  skip: number;
  limit: number;
  total: number;
  hasMore: boolean;
  loading: boolean;
}

@Injectable({ providedIn: "root" })
export class TodosPaginationStateService {
  private entityStore = inject(EntityStoreService);

  todoPagination = signal<TodoPagination>({
    skip: 0,
    limit: 10,
    total: 0,
    hasMore: true,
    loading: false,
  });

  loadInitialTodos(): void {
    const hasAllTodos =
      this.entityStore.privateTodos().length > 0 &&
      this.entityStore.sharedTodos().length > 0 &&
      this.entityStore.publicTodos().length > 0;
    if (hasAllTodos) {
      this.todoPagination.update((p) => ({
        ...p,
        skip: this.entityStore.todos().length,
        hasMore: this.entityStore.hasMoreTodos(),
        total: this.entityStore.todos().length,
        loading: false,
      }));
      return;
    }

    this.todoPagination.update((p) => ({ ...p, loading: true }));
    this.entityStore.ensureTodosLoaded("all");
    this.todoPagination.update((p) => ({ ...p, loading: false }));
  }

  loadMore(): void {
    if (this.todoPagination().loading || !this.todoPagination().hasMore) return;
    this.entityStore.loadMoreTodos();
  }
}
