import { signal, Signal, WritableSignal } from "@angular/core";

/**
 * Base class for List views (TodosView, TasksView, SubtasksView, CategoriesView)
 * Provides common functionality for filtering, sorting, and drag-drop
 */
export abstract class BaseListView<T extends { id: string }> {
  // Filter state
  showFilter = signal(false);
  activeFilter = signal<string>("all");
  searchFunc = signal("");
  isUpdatingOrder = signal(false);

  // Filter options - common across all list views
  readonly filterOptions = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "completed", label: "Completed" },
    { key: "skipped", label: "Skipped" },
    { key: "failed", label: "Failed" },
    { key: "done", label: "Done" },
    { key: "high", label: "High Priority" },
  ];

  /**
   * Toggle filter panel visibility
   */
  toggleFilter(): void {
    this.showFilter.update((val) => !val);
  }

  /**
   * Change active filter and apply it
   */
  changeFilter(filter: string): void {
    this.activeFilter.set(filter);
    this.applyFilter();
  }

  /**
   * Apply filter - to be implemented by subclasses
   */
  protected abstract applyFilter(): void;

  /**
   * Track by ID for *ngFor
   */
  trackById(index: number, item: T): string {
    return item.id;
  }

  /**
   * Handle drag start
   */
  onDragStart(event: DragEvent, item: T): void {
    event.dataTransfer?.setData("text/plain", item.id);
    event.dataTransfer!.effectAllowed = "move";
  }

  /**
   * Handle drop - to be implemented by subclasses
   */
  abstract onDrop(event: DragEvent): void;

  /**
   * Handle drag over
   */
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.dataTransfer!.dropEffect = "move";
  }
}
