import { Directive, signal } from "@angular/core";

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

  protected handleError(err: any): void {
    const errorMessage = err?.message || err?.toString() || "An unexpected error occurred";
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
}
