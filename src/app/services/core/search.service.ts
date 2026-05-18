import { Injectable, inject, signal, computed } from "@angular/core";
import { Observable, Subject, debounceTime, distinctUntilChanged, switchMap } from "rxjs";
import { takeUntil } from "rxjs/operators";
import { ApiService } from "@services/api.service";
import { StorageService } from "@services/storage.service";
import { AuthService } from "@services/auth/auth.service";
import { MongoConnectionService } from "@services/core/mongo-connection.service";
import { FilteredListHelper } from "@helpers/filtered-list.helper";

export type SearchableEntity = "todos" | "tasks" | "subtasks" | "comments" | "chats" | "categories";

export interface SearchResult<T> {
  items: T[];
  hasMore: boolean;
  fromCache: boolean;
}

@Injectable({ providedIn: "root" })
export class SearchService {
  private apiService = inject(ApiService);
  private storageService = inject(StorageService);
  private authService = inject(AuthService);
  private mongoConnectionService = inject(MongoConnectionService);

  private searchSubject = new Subject<{ entity: SearchableEntity; query: string }>();
  private destroy$ = new Subject<void>();

  private searchState = signal<
    Record<
      SearchableEntity,
      {
        items: any[];
        hasMore: boolean;
        isLoading: boolean;
        currentQuery: string;
      }
    >
  >({
    todos: { items: [], hasMore: true, isLoading: false, currentQuery: "" },
    tasks: { items: [], hasMore: true, isLoading: false, currentQuery: "" },
    subtasks: { items: [], hasMore: true, isLoading: false, currentQuery: "" },
    comments: { items: [], hasMore: true, isLoading: false, currentQuery: "" },
    chats: { items: [], hasMore: true, isLoading: false, currentQuery: "" },
    categories: { items: [], hasMore: true, isLoading: false, currentQuery: "" },
  });

  readonly todosResults = computed(() => this.searchState().todos.items);
  readonly tasksResults = computed(() => this.searchState().tasks.items);
  readonly subtasksResults = computed(() => this.searchState().subtasks.items);
  readonly commentsResults = computed(() => this.searchState().comments.items);
  readonly chatsResults = computed(() => this.searchState().chats.items);
  readonly categoriesResults = computed(() => this.searchState().categories.items);

  readonly isSearching = computed(() => {
    const state = this.searchState();
    return (
      state.todos.isLoading ||
      state.tasks.isLoading ||
      state.subtasks.isLoading ||
      state.comments.isLoading ||
      state.chats.isLoading ||
      state.categories.isLoading
    );
  });

  constructor() {
    this.searchSubject
      .pipe(
        debounceTime(300),
        distinctUntilChanged((a, b) => a.entity === b.entity && a.query === b.query),
        switchMap(({ entity, query }) => this.performSearch(entity, query)),
        takeUntil(this.destroy$)
      )
      .subscribe();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  search(entity: SearchableEntity, query: string): void {
    this.updateState(entity, { currentQuery: query });

    if (!query.trim()) {
      this.updateState(entity, { items: [], hasMore: true });
      this.loadFromCache(entity);
      return;
    }

    this.updateState(entity, { isLoading: true });
    this.searchSubject.next({ entity, query });
  }

  private performSearch(entity: SearchableEntity, query: string): Observable<SearchResult<any>> {
    return new Observable((subscriber) => {
      if (!query.trim()) {
        subscriber.next({ items: [], hasMore: false, fromCache: true });
        subscriber.complete();
        return;
      }

      if (!this.mongoConnectionService.isConnected()) {
        this.searchLocally(entity, query).subscribe({
          next: (result) => {
            this.updateState(entity, { isLoading: false });
            subscriber.next(result);
            subscriber.complete();
          },
          error: (err) => {
            this.updateState(entity, { isLoading: false });
            subscriber.error(err);
          },
        });
        return;
      }

      const token = this.authService.getToken();

      this.apiService
        .invokeCommand<any[]>("search_data", {
          table: entity,
          query: query,
          token: token,
          visibility: this.getVisibility(entity),
          page: 0,
          limit: 50,
        })
        .subscribe({
          next: (items) => {
            this.updateState(entity, {
              items: items || [],
              hasMore: (items?.length || 0) >= 50,
              isLoading: false,
            });
            subscriber.next({
              items: items || [],
              hasMore: (items?.length || 0) >= 50,
              fromCache: false,
            });
            subscriber.complete();
          },
          error: (err) => {
            this.updateState(entity, { isLoading: false });
            this.searchLocally(entity, query).subscribe({
              next: (result) => {
                subscriber.next(result);
                subscriber.complete();
              },
              error: () => subscriber.error(err),
            });
          },
        });
    });
  }

  private searchLocally(entity: SearchableEntity, query: string): Observable<SearchResult<any>> {
    return new Observable((subscriber) => {
      const items = this.getLocalItems(entity);
      const filtered = FilteredListHelper.filterAndSort(items, {
        filter: "all",
        query: query,
        filterType: this.getFilterType(entity),
      });

      subscriber.next({ items: filtered, hasMore: false, fromCache: true });
      subscriber.complete();
    });
  }

  private getLocalItems(entity: SearchableEntity): any[] {
    switch (entity) {
      case "todos":
        return this.storageService.todos();
      case "tasks":
        return this.storageService.tasks();
      case "subtasks":
        return this.storageService.subtasks();
      case "comments":
        return this.storageService.comments();
      case "chats":
        return this.storageService.chats();
      case "categories":
        return this.storageService.categories();
      default:
        return [];
    }
  }

  private getVisibility(_entity: SearchableEntity): string {
    return "all";
  }

  private getFilterType(entity: SearchableEntity): "status" | "visibility" {
    return entity === "todos" ? "visibility" : "status";
  }

  private updateState(
    entity: SearchableEntity,
    updates: Partial<{
      items: any[];
      hasMore: boolean;
      isLoading: boolean;
      currentQuery: string;
    }>
  ): void {
    this.searchState.update((state) => ({
      ...state,
      [entity]: { ...state[entity], ...updates },
    }));
  }

  private loadFromCache(entity: SearchableEntity): void {
    const state = this.searchState()[entity];
    if (state.items.length > 0) return;

    const items = this.getLocalItems(entity);
    if (items.length > 0) {
      this.updateState(entity, { items });
    }
  }

  clearResults(entity: SearchableEntity): void {
    this.updateState(entity, { items: [], hasMore: true, currentQuery: "" });
  }

  clearAllResults(): void {
    const entities: SearchableEntity[] = [
      "todos",
      "tasks",
      "subtasks",
      "comments",
      "chats",
      "categories",
    ];
    entities.forEach((entity) => this.clearResults(entity));
  }
}
