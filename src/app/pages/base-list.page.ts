import { Directive, signal, inject, OnDestroy, OnInit } from "@angular/core";
import { Subscription } from "rxjs";
import { AuthService } from "@services/auth/auth.service";
import { BulkActionService } from "@services/bulk-action.service";
import { ApiService } from "@services/api.service";
import { NotifyService } from "@services/notifications/notify.service";
import { ShortcutService } from "@services/ui/shortcut.service";
import { UnifiedStorageService } from "@core/services/unified-storage.service";
export type ViewMode = "card" | "grid" | "table" | "list" | "kanban";
/**
 * Abstract base class for list views (todos, tasks, subtasks).
 * Contains shared filter/search/error/loading state and methods.
 *
 * Note: bulk-selection signals (selectedTasks, selectedTodos, selectedSubtasks)
 * are kept in each subclass because templates reference them by their specific names.
 */
@Directive()
export abstract class BaseListView implements OnInit, OnDestroy {
  protected error = signal<string | null>(null);
  protected loading = signal(false);
  protected showFilter = signal(false);
  protected activeFilter = signal<string>("all");
  protected searchQuery = signal<string>("");
  protected viewMode = signal<ViewMode>("grid");
  protected pageKey = "default";
  protected selectedItems = signal<Set<string>>(new Set());
  protected lastSelectedId = signal<string | null>(null);
  protected dataSyncService = inject(ApiService);
  protected notifyService = inject(NotifyService);
  protected shortcutService = inject(ShortcutService);
  protected bulkActionService = inject(BulkActionService);
  protected authService = inject(AuthService);
  protected storage = inject(UnifiedStorageService);
  protected dataLoader = inject(ApiService);
  protected dataService = inject(ApiService);
  protected readonly subscriptions = new Subscription();
  protected isOffline = signal(false);
  protected expandedItemIds = signal<Set<string>>(new Set());
  protected abstract getItems(): { id: string }[];
  protected get currentUserId(): string {
    return this.authService.getValueByKey("id");
  }
  protected toggleExpandItem(itemId: string): void {
    this.expandedItemIds.update((set) => {
      const newSet = new Set(set);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  }
  protected isItemExpanded(itemId: string | undefined): boolean {
    return itemId ? this.expandedItemIds().has(itemId) : false;
  }
  protected clearExpandedItems(): void {
    this.expandedItemIds.set(new Set());
  }
  private onOnline = (): void => {
    this.isOffline.set(false);
  };
  private onOffline = (): void => {
    this.isOffline.set(true);
  };
  protected bindOfflineListeners(): void {
    if (typeof window === "undefined") return;
    window.addEventListener("online", this.onOnline);
    window.addEventListener("offline", this.onOffline);
    this.isOffline.set(!navigator.onLine);
  }
  protected unbindOfflineListeners(): void {
    window.removeEventListener("online", this.onOnline);
    window.removeEventListener("offline", this.onOffline);
  }
  ngOnInit(): void {
    this.bindOfflineListeners();
  }
  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
  protected get STORAGE_KEY(): string {
    return `view-mode-${this.pageKey}`;
  }
  protected handleError(err: unknown): void {
    const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
    this.error.set(errorMessage);
  }
  protected clearError(): void {
    this.error.set(null);
  }
  toggleFilter(): void {
    this.showFilter.update((v) => !v);
  }
  onSearchChange(query: string): void {
    this.searchQuery.set(query);
  }
  changeFilter(filter: string): void {
    this.activeFilter.set(filter);
  }
  setViewMode(mode: ViewMode): void {
    this.viewMode.set(mode);
    this.saveViewModePreference(mode);
  }
  loadViewModePreference(): ViewMode {
    if (typeof window === "undefined") return "card";
    const saved = localStorage.getItem(this.STORAGE_KEY);
    return (saved as ViewMode) || "card";
  }
  protected saveViewModePreference(mode: ViewMode): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(this.STORAGE_KEY, mode);
  }
  toggleSelectAll(getItemsFn?: () => { id: string }[], isAllSelectedFn?: () => boolean): void {
    const allItems = getItemsFn ? getItemsFn() : this.getItems();
    const allSelected = isAllSelectedFn ? isAllSelectedFn() : this.isAllSelected();
    this.selectedItems.update((selected) => {
      const newSelected = new Set(selected);
      if (allSelected) {
        allItems.forEach((item) => newSelected.delete(item.id));
      } else {
        allItems.forEach((item) => newSelected.add(item.id));
      }
      return newSelected;
    });
  }
  isAllSelected(getItemsFn?: () => { id: string }[]): boolean {
    const currentList = getItemsFn ? getItemsFn() : this.getItems();
    return currentList.length > 0 && currentList.every((item) => this.selectedItems().has(item.id));
  }
  clearSelection(): void {
    this.selectedItems.set(new Set());
    this.lastSelectedId.set(null);
    this.bulkActionService.setSelectionState(0, false);
  }
  protected selectRange(fromId: string, toId: string, items: { id: string }[]): void {
    const fromIndex = items.findIndex((i) => i.id === fromId);
    const toIndex = items.findIndex((i) => i.id === toId);
    if (fromIndex === -1 || toIndex === -1) return;
    const [start, end] = fromIndex < toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex];
    const idsInRange = items.slice(start, end + 1).map((i) => i.id);
    this.selectedItems.update((selected) => {
      const newSelected = new Set(selected);
      idsInRange.forEach((id) => newSelected.add(id));
      return newSelected;
    });
  }
  protected toggleItemSelection(id: string): void {
    this.selectedItems.update((selected) => {
      const newSelected = new Set(selected);
      if (newSelected.has(id)) {
        newSelected.delete(id);
      } else {
        newSelected.add(id);
      }
      return newSelected;
    });
  }
  getUnreadCount(chats: () => { deleted_at?: string | null; read_by?: string[] }[]): number {
    const currentUserId = this.authService.getValueByKey("id");
    return chats().filter(
      (c) => !c.deleted_at && (!c.read_by || !c.read_by.includes(currentUserId))
    ).length;
  }
  handleHighlightQueryParams(
    queryParams: any,
    highlightParamName: string,
    idPrefix: string,
    onHighlightEnd?: () => void
  ): void {
    const id = queryParams[highlightParamName];
    if (!id) return;
    setTimeout(() => {
      const element = document.getElementById(idPrefix + id);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        element.classList.add("bg-green-100", "dark:bg-green-900/20", "animate-pulse");
        setTimeout(() => {
          element.classList.remove("bg-green-100", "dark:bg-green-900/20", "animate-pulse");
          if (onHighlightEnd) {
            onHighlightEnd();
          }
        }, 5000);
      }
    }, 500);
  }
  protected loadEntityPage(
    entity: "todos" | "tasks" | "subtasks" | "comments" | "chats",
    options?: any
  ): void {
    switch (entity) {
      case "todos":
        this.dataService.loadPage("todos", options).subscribe();
        break;
      case "tasks":
        if (options?.todoId) {
          this.dataService.loadPage("tasks", options).subscribe();
        }
        break;
      case "subtasks":
        this.dataService.loadPage("subtasks", options).subscribe();
        break;
      case "comments":
        if (options?.taskId) {
          this.dataService.loadPage("comments", options).subscribe();
        } else if (options?.subtaskId) {
          this.dataService.loadPage("comments", options).subscribe();
        }
        break;
      case "chats":
        this.dataService.loadPage("chats", options).subscribe();
        break;
    }
  }
  protected isLoading(): boolean {
    return false;
  }
}
