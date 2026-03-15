/* sys lib */
import { Injectable, signal, computed } from "@angular/core";

export type BulkActionMode = "admin" | "archive" | "todos" | "tasks" | "subtasks";

export interface BulkActionState {
  selectedIds: Set<string>;
  isAllSelected: boolean;
  totalCount: number;
  mode: BulkActionMode;
  show: boolean;
}

@Injectable({
  providedIn: "root",
})
export class BulkActionService {
  private state = signal<BulkActionState>({
    selectedIds: new Set(),
    isAllSelected: false,
    totalCount: 0,
    mode: "todos",
    show: false,
  });

  selectedIds = computed(() => this.state().selectedIds);
  selectedCount = computed(() => this.state().selectedIds.size);
  isAllSelected = computed(() => this.state().isAllSelected);
  totalCount = computed(() => this.state().totalCount);
  mode = computed(() => this.state().mode);
  show = computed(() => this.state().show);

  /**
   * Initialize bulk actions for a specific mode
   */
  init(mode: BulkActionMode, totalCount: number): void {
    this.state.set({
      selectedIds: new Set(),
      isAllSelected: false,
      totalCount,
      mode,
      show: false,
    });
  }

  /**
   * Toggle selection of a single item
   */
  toggleSelection(id: string): void {
    const currentState = this.state();
    const newSelected = new Set(currentState.selectedIds);

    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }

    this.state.set({
      ...currentState,
      selectedIds: newSelected,
      show: newSelected.size > 0,
      isAllSelected: newSelected.size === currentState.totalCount && currentState.totalCount > 0,
    });
  }

  /**
   * Toggle select all items
   */
  toggleSelectAll(): void {
    const currentState = this.state();

    if (currentState.isAllSelected) {
      // Deselect all
      this.state.set({
        ...currentState,
        selectedIds: new Set(),
        show: false,
        isAllSelected: false,
      });
    } else {
      // Select all - we need to emit event to parent to get all IDs
      this.state.set({
        ...currentState,
        isAllSelected: true,
      });
    }
  }

  /**
   * Select all items (called from parent with all IDs)
   */
  selectAll(ids: string[]): void {
    const currentState = this.state();
    this.state.set({
      ...currentState,
      selectedIds: new Set(ids),
      show: ids.length > 0,
      isAllSelected: ids.length === currentState.totalCount && currentState.totalCount > 0,
    });
  }

  /**
   * Clear selection
   */
  clearSelection(): void {
    const currentState = this.state();
    this.state.set({
      ...currentState,
      selectedIds: new Set(),
      show: false,
      isAllSelected: false,
    });
  }

  /**
   * Update total count (for filtered lists)
   */
  updateTotalCount(count: number): void {
    const currentState = this.state();
    const newSelected = new Set(
      Array.from(currentState.selectedIds) // Keep existing selections
    );

    this.state.set({
      ...currentState,
      totalCount: count,
      isAllSelected: newSelected.size === count && count > 0,
    });
  }

  /**
   * Set mode
   */
  setMode(mode: BulkActionMode): void {
    const currentState = this.state();
    this.state.set({
      ...currentState,
      mode,
    });
  }

  /**
   * Directly set selected count and show state (for views with local selection)
   */
  setSelectionState(count: number, isAllSelected: boolean): void {
    const currentState = this.state();
    this.state.set({
      ...currentState,
      selectedIds: count > 0 ? currentState.selectedIds : new Set(), // Keep existing or clear
      show: count > 0,
      isAllSelected,
    });
  }
}
