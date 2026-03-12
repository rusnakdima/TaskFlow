import { signal } from "@angular/core";

/**
 * Base class for views that support filtering and searching
 */
export abstract class FilterableViewBase {
  /**
   * Whether the filter bar is visible
   */
  showFilter = signal(false);

  /**
   * The currently active filter key
   */
  activeFilter = signal("all");

  /**
   * The current search query string
   */
  searchQuery = signal("");

  /**
   * Toggle filter bar visibility
   */
  toggleFilter() {
    this.showFilter.update((v) => !v);
  }

  /**
   * Change the active filter
   */
  changeFilter(filter: string) {
    this.activeFilter.set(filter);
  }

  /**
   * Clear all filters and search query
   */
  clearFilters() {
    this.activeFilter.set("all");
    this.searchQuery.set("");
  }

  /**
   * Handle search query change
   */
  onSearchChange(query: string) {
    this.searchQuery.set(query);
  }
}
