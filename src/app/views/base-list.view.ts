import { Directive, signal } from "@angular/core";

export type ViewMode = "card" | "grid" | "table";

/**
 * Abstract base class for list views (todos, tasks, subtasks).
 * Contains shared filter/search/error/loading state and methods.
 *
 * Note: bulk-selection signals (selectedTasks, selectedTodos, selectedSubtasks)
 * are kept in each subclass because templates reference them by their specific names.
 */
@Directive()
export abstract class BaseListView {
  protected error = signal<string | null>(null);
  protected loading = signal(false);

  protected showFilter = signal(false);
  protected activeFilter = signal<string>("all");
  protected searchQuery = signal<string>("");

  protected viewMode = signal<ViewMode>("grid");
  protected pageKey = "default";

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
}
