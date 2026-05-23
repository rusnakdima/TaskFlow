import { Injectable, inject, signal, computed } from "@angular/core";
import { Observable, Subject, debounceTime, distinctUntilChanged, switchMap, forkJoin } from "rxjs";
import { takeUntil } from "rxjs/operators";
import { ApiService } from "@services/api.service";
import { StorageService } from "@services/storage.service";
import { AuthService } from "@services/auth/auth.service";
import { MongoConnectionService } from "@services/core/mongo-connection.service";
import { ProfileSearchService } from "@services/core/profile-search.service";
import { FilteredListHelper } from "@helpers/filtered-list.helper";

export type SearchableEntity = "todos" | "tasks" | "subtasks" | "comments" | "chats" | "categories";

export type GlobalSearchCategory =
  | "project"
  | "task"
  | "subtask"
  | "category"
  | "user"
  | "page"
  | "action"
  | "chat";

export interface GlobalSearchItem {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  category: GlobalSearchCategory;
  route?: string;
  data?: any;
}

export interface GlobalSearchResults {
  projects: GlobalSearchItem[];
  tasks: GlobalSearchItem[];
  subtasks: GlobalSearchItem[];
  categories: GlobalSearchItem[];
  users: GlobalSearchItem[];
  chats: GlobalSearchItem[];
  rooms: GlobalSearchItem[];
}

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
  private profileSearchService = inject(ProfileSearchService);

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

  private globalSearchSubject = new Subject<string>();
  private globalSearchState = signal<GlobalSearchResults>({
    projects: [],
    tasks: [],
    subtasks: [],
    categories: [],
    users: [],
    chats: [],
    rooms: [],
  });

  readonly globalSearchResults = computed(() => this.globalSearchState());

  readonly isGlobalSearching = signal(false);

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

    this.initGlobalSearchListener();
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
          offline: !this.mongoConnectionService.isConnected(),
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

  searchAllEntities(query: string): void {
    if (!query.trim()) {
      this.globalSearchState.set({
        projects: [],
        tasks: [],
        subtasks: [],
        categories: [],
        users: [],
        chats: [],
        rooms: [],
      });
      return;
    }

    this.isGlobalSearching.set(true);
    this.globalSearchSubject.next(query);
  }

  private performGlobalSearch(query: string): void {
    const q = query.toLowerCase();
    this.isGlobalSearching.set(true);

    const storageResults = this.performGlobalSearchFromStorage(q);
    this.globalSearchState.set(storageResults);

    if (this.mongoConnectionService.isConnected()) {
      this.performGlobalSearchFromApi(query, storageResults);
    } else {
      this.profileSearchService.loadInitial().subscribe();
      this.isGlobalSearching.set(false);
    }
  }

  private performGlobalSearchFromApi(query: string, baseResults?: GlobalSearchResults): void {
    const token = this.authService.getToken();

    forkJoin({
      projects: this.apiService.invokeCommand<any[]>("search_data", {
        table: "todos",
        query: query,
        token: token,
        visibility: "all",
        page: 0,
        limit: 5,
      }),
      tasks: this.apiService.invokeCommand<any[]>("search_data", {
        table: "tasks",
        query: query,
        token: token,
        visibility: "all",
        page: 0,
        limit: 5,
      }),
      subtasks: this.apiService.invokeCommand<any[]>("search_data", {
        table: "subtasks",
        query: query,
        token: token,
        visibility: "all",
        page: 0,
        limit: 5,
      }),
      categories: this.apiService.invokeCommand<any[]>("search_data", {
        table: "categories",
        query: query,
        token: token,
        visibility: "all",
        page: 0,
        limit: 5,
      }),
      chats: this.apiService.invokeCommand<any[]>("search_data", {
        table: "chats",
        query: query,
        token: token,
        visibility: "all",
        page: 0,
        limit: 5,
      }),
      profiles: this.apiService.invokeCommand<any[]>("search_data", {
        table: "profiles",
        query: query,
        token: token,
        visibility: "all",
        page: 0,
        limit: 5,
      }),
      rooms: this.apiService.invokeCommand<any[]>("get_rooms", {
        token: token,
      }),
    }).subscribe({
      next: (results) => {
        const apiProjects = (results.projects || []).map((t: any) => ({
          id: t.id,
          label: t.title,
          description: t.description?.slice(0, 100) || "",
          icon: "list_alt",
          category: "project" as GlobalSearchCategory,
          route: `/todos/${t.id}/tasks?visibility=${t.visibility || "private"}`,
          data: t,
        }));

        const apiTasks = (results.tasks || []).map((t: any) => ({
          id: t.id,
          label: t.title,
          description: t.description?.slice(0, 100) || "",
          icon: "assignment",
          category: "task" as GlobalSearchCategory,
          route: `/todos/${t.todo_id}/tasks?highlightTaskId=${t.id}&visibility=${t.visibility || "private"}`,
          data: t,
        }));

        const apiSubtasks = (results.subtasks || []).map((s: any) => {
          const parentTask = this.storageService.getTaskById(s.task_id);
          const route = parentTask
            ? `/todos/${parentTask.todo_id}/tasks/${s.task_id}/subtasks?highlightSubtask=${s.id}`
            : undefined;
          return {
            id: s.id,
            label: s.title,
            description: s.description?.slice(0, 100) || "",
            icon: "subdirectory_arrow_right",
            category: "subtask" as GlobalSearchCategory,
            route,
            data: s,
          };
        });

        const apiCategories = (results.categories || []).map((c: any) => ({
          id: c.id,
          label: c.title,
          icon: "category",
          category: "category" as GlobalSearchCategory,
          route: `/categories?highlightCategoryId=${c.id}`,
          data: c,
        }));

        const apiChats = (results.chats || []).map((c: any) => ({
          id: c.id,
          label: c.content?.slice(0, 50) || "Chat message",
          description: c.author_name || "",
          icon: "chat",
          category: "chat" as GlobalSearchCategory,
          route: `/chat?room=${c.room_id || c.user_id}`,
          data: c,
        }));

        const apiProfiles = (results.profiles || []).map((p: any) => ({
          id: p.id,
          label: p.name && p.last_name ? `${p.name} ${p.last_name}` : p.user?.username || "Unknown",
          description: p.user?.email || "",
          icon: "person",
          category: "user" as GlobalSearchCategory,
          route: `/profile?userId=${p.user_id}`,
          data: p,
        }));

        const apiRooms = ((results.rooms || []) as any[])
          .filter((r: any) => r.name?.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 5)
          .map((r: any) => ({
            id: r.id || r.room,
            label: r.name || (r.is_group ? "Group" : "Conversation"),
            description: r.is_group ? "Group" : "Direct message",
            icon: r.is_group ? "group" : "chat",
            category: "chat" as GlobalSearchCategory,
            route: `/chat?room=${r.room || r.id}`,
            data: r,
          }));

        const profiles =
          apiProfiles.length > 0
            ? apiProfiles
            : this.getProfilesFromStorage(query.toLowerCase())
                .slice(0, 5)
                .map((p: any) => ({
                  id: p.id,
                  label:
                    p.name && p.last_name
                      ? `${p.name} ${p.last_name}`
                      : p.user?.username || "Unknown",
                  description: p.user?.email || "",
                  icon: "person",
                  category: "user" as GlobalSearchCategory,
                  route: `/profile?userId=${p.user_id}`,
                  data: p,
                }));

        const projects = apiProjects.length > 0 ? apiProjects : baseResults?.projects || [];
        const tasks = apiTasks.length > 0 ? apiTasks : baseResults?.tasks || [];
        const subtasks = apiSubtasks.length > 0 ? apiSubtasks : baseResults?.subtasks || [];
        const categories = apiCategories.length > 0 ? apiCategories : baseResults?.categories || [];
        const chats = apiChats.length > 0 ? apiChats : baseResults?.chats || [];
        const users = profiles.length > 0 ? profiles : baseResults?.users || [];
        const rooms = apiRooms.length > 0 ? apiRooms : baseResults?.rooms || [];

        this.globalSearchState.set({
          projects,
          tasks,
          subtasks,
          categories,
          users,
          chats,
          rooms,
        });
        this.isGlobalSearching.set(false);
      },
      error: () => {
        this.isGlobalSearching.set(false);
      },
    });
  }

  private performGlobalSearchFromStorage(q: string): GlobalSearchResults {
    const projects = this.storageService
      .todos()
      .filter((t) => t.title?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q))
      .slice(0, 5)
      .map((t: any) => ({
        id: t.id,
        label: t.title,
        description: t.description?.slice(0, 100),
        icon: "list_alt",
        category: "project" as GlobalSearchCategory,
        route: `/todos/${t.id}/tasks?visibility=${t.visibility || "private"}`,
        data: t,
      }));

    const tasks = this.storageService
      .tasks()
      .filter((t) => t.title?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q))
      .slice(0, 5)
      .map((t: any) => ({
        id: t.id,
        label: t.title,
        description: t.description?.slice(0, 100),
        icon: "assignment",
        category: "task" as GlobalSearchCategory,
        route: `/todos/${t.todo_id}/tasks?highlightTaskId=${t.id}&visibility=${t.visibility || "private"}`,
        data: t,
      }));

    const subtasks = this.storageService
      .subtasks()
      .filter((s) => s.title?.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q))
      .slice(0, 5)
      .map((s) => {
        const parentTask = this.storageService.getTaskById(s.task_id);
        const route = parentTask
          ? `/todos/${parentTask.todo_id}/tasks/${s.task_id}/subtasks?highlightSubtask=${s.id}`
          : undefined;
        return {
          id: s.id,
          label: s.title,
          description: s.description?.slice(0, 100),
          icon: "subdirectory_arrow_right",
          category: "subtask" as GlobalSearchCategory,
          route,
          data: s,
        };
      });

    const categories = this.storageService
      .categories()
      .filter((c) => c.title?.toLowerCase().includes(q))
      .slice(0, 5)
      .map((c: any) => ({
        id: c.id,
        label: c.title,
        icon: "category",
        category: "category" as GlobalSearchCategory,
        route: `/categories?highlightCategoryId=${c.id}`,
        data: c,
      }));

    const users = this.getProfilesFromStorage(q)
      .slice(0, 5)
      .map((p) => ({
        id: p.id,
        label: p.name && p.last_name ? `${p.name} ${p.last_name}` : p.user?.username || "Unknown",
        description: p.user?.email || "",
        icon: "person",
        category: "user" as GlobalSearchCategory,
        route: `/profile?userId=${p.user_id}`,
        data: p,
      }));

    const chats = this.storageService
      .chats()
      .filter(
        (c) => c.content?.toLowerCase().includes(q) || c.author_name?.toLowerCase().includes(q)
      )
      .slice(0, 5)
      .map((c) => ({
        id: c.id,
        label: c.content?.slice(0, 50) || "Chat message",
        description: c.author_name || "",
        icon: "chat",
        category: "chat" as GlobalSearchCategory,
        route: `/chat?room=${c.room_id || c.user_id}`,
        data: c,
      }));

    const rooms = (this.storageService.rooms() || [])
      .filter((r: any) => r.name?.toLowerCase().includes(q))
      .slice(0, 5)
      .map((r: any) => ({
        id: r.id || r.room,
        label: r.name || (r.is_group ? "Group" : "Conversation"),
        description: r.is_group ? "Group" : "Direct message",
        icon: r.is_group ? "group" : "chat",
        category: "chat" as GlobalSearchCategory,
        route: `/chat?room=${r.room || r.id}`,
        data: r,
      }));

    return { projects, tasks, subtasks, categories, users, chats, rooms };
  }

  private getProfilesFromStorage(query: string): any[] {
    const profiles = this.storageService.allProfiles() || [];
    const q = query.toLowerCase();
    return profiles.filter((p) => {
      const fullName = `${p.name || ""} ${p.last_name || ""}`.toLowerCase();
      const username = p.user?.username?.toLowerCase() || "";
      const email = p.user?.email?.toLowerCase() || "";
      return fullName.includes(q) || username.includes(q) || email.includes(q);
    });
  }

  clearGlobalSearch(): void {
    this.globalSearchState.set({
      projects: [],
      tasks: [],
      subtasks: [],
      categories: [],
      users: [],
      chats: [],
      rooms: [],
    });
  }

  initGlobalSearchListener(): void {
    this.globalSearchSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((query) => {
        this.performGlobalSearch(query);
      });
  }
}
