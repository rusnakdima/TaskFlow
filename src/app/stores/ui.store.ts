import { Injectable, signal } from "@angular/core";
import { ViewMode } from "@models/view-mode.model";

@Injectable({ providedIn: "root" })
export class UIStore {
  private readonly _viewMode = signal<ViewMode>("grid");
  readonly viewMode = this._viewMode.asReadonly();

  private readonly _searchQuery = signal<string>("");
  readonly searchQuery = this._searchQuery.asReadonly();

  private readonly _activeFilters = signal<Record<string, string | string[]>>({});
  readonly activeFilters = this._activeFilters.asReadonly();

  private readonly _sidebarOpen = signal(false);
  readonly sidebarOpen = this._sidebarOpen.asReadonly();

  private readonly _showFilter = signal(false);
  readonly showFilter = this._showFilter.asReadonly();

  private readonly _activeFilter = signal<string>("all");
  readonly activeFilter = this._activeFilter.asReadonly();

  private _pageKey = "default";

  setViewMode(mode: ViewMode): void {
    this._viewMode.set(mode);
    this.saveViewModePreference(mode);
  }

  setSearchQuery(query: string): void {
    this._searchQuery.set(query);
  }

  setFieldFilter(fieldKey: string, value: string | string[]): void {
    this._activeFilters.update((filters) => ({ ...filters, [fieldKey]: value }));
  }

  clearFieldFilter(fieldKey: string): void {
    this._activeFilters.update((filters) => {
      const newFilters = { ...filters };
      delete newFilters[fieldKey];
      return newFilters;
    });
  }

  clearAllFilters(): void {
    this._activeFilters.set({});
  }

  toggleSidebar(): void {
    this._sidebarOpen.update((open) => !open);
  }

  toggleFilter(): void {
    this._showFilter.update((show) => !show);
  }

  setActiveFilter(filter: string): void {
    this._activeFilter.set(filter);
  }

  setPageKey(key: string): void {
    this._pageKey = key;
  }

  loadViewModePreference(): ViewMode {
    const saved = localStorage.getItem(`view-mode-${this._pageKey}`);
    return (saved as ViewMode) || "card";
  }

  saveViewModePreference(mode: ViewMode): void {
    localStorage.setItem(`view-mode-${this._pageKey}`, mode);
  }
}
