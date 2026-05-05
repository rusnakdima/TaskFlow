import { Directive, signal, inject, OnDestroy, OnInit } from "@angular/core";
import { Subscription } from "rxjs";

import { AuthService } from "@services/auth/auth.service";
import { BulkActionService } from "@services/bulk-action.service";
import { DataLoaderService } from "@services/data/data-loader.service";
import { NotifyService } from "@services/notifications/notify.service";
import { ShortcutService } from "@services/ui/shortcut.service";

export type ViewMode = "card" | "grid" | "table" | "list";

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

  protected dataSyncService = inject(DataLoaderService);
  protected notifyService = inject(NotifyService);
  protected shortcutService = inject(ShortcutService);
  protected bulkActionService = inject(BulkActionService);
  protected authService = inject(AuthService);

  protected readonly subscriptions = new Subscription();

  protected isOffline = signal(false);

  protected expandedItemIds = signal<Set<string>>(new Set());

  protected abstract getItems(): { id: string }[];

  protected get currentUserId(): string {
    return this.authService.getValueByKey("id");
  }

  protected get FILTER_STORAGE_KEY(): string {
    return `filter-${this.pageKey}`;
  }

  protected get SHOW_FILTER_STORAGE_KEY(): string {
    return `show-filter-${this.pageKey}`;
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
    this.showFilter.update((v) => {
      const newVal = !v;
      localStorage.setItem(this.SHOW_FILTER_STORAGE_KEY, newVal ? "true" : "false");
      return newVal;
    });
  }

  onSearchChange(query: string): void {
    this.searchQuery.set(query);
  }

  changeFilter(filter: string): void {
    this.activeFilter.set(filter);
    localStorage.setItem(this.FILTER_STORAGE_KEY, filter);
  }

  protected loadFilterPreferences(): void {
    if (typeof window === "undefined") return;
    const savedShowFilter = localStorage.getItem(this.SHOW_FILTER_STORAGE_KEY);
    if (savedShowFilter !== null) {
      this.showFilter.set(savedShowFilter === "true");
    }
    const savedActiveFilter = localStorage.getItem(this.FILTER_STORAGE_KEY);
    if (savedActiveFilter !== null) {
      this.activeFilter.set(savedActiveFilter);
    }
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
    this.bulkActionService.setSelectionState(0, false);
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
    colorClass: string
  ): void {
    const id = queryParams[highlightParamName];
    if (!id) return;

    setTimeout(() => {
      const element = document.getElementById(idPrefix + id);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        element.classList.add("ring-4", colorClass, "animate-pulse");
        setTimeout(() => {
          element.classList.remove("ring-4", colorClass, "animate-pulse");
        }, 2000);
      }
    }, 500);
  }
}
