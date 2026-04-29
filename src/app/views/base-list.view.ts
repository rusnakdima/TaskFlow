import { Directive, signal, inject, OnDestroy, OnInit } from "@angular/core";
import { Subscription } from "rxjs";

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

  protected readonly subscriptions = new Subscription();

  protected isOffline = signal(false);

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
    this.subscriptions.add(
      this.shortcutService.refresh$.subscribe(() => {
        this.dataSyncService.loadAllData(true).subscribe(() => {
          this.notifyService.showSuccess("Data refreshed");
        });
      })
    );
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

  toggleSelectAll(getItemsFn: () => { id: string }[], isAllSelectedFn: () => boolean): void {
    const allItems = getItemsFn();
    const allSelected = isAllSelectedFn();

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

  isAllSelected(getItemsFn: () => { id: string }[]): boolean {
    const currentList = getItemsFn();
    return currentList.length > 0 && currentList.every((item) => this.selectedItems().has(item.id));
  }

  clearSelection(): void {
    this.selectedItems.set(new Set());
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
