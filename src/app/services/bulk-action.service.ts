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
   * Set the current pool of IDs that can be selected (e.g. current filtered list)
   */
  updateTotalCount(count: number, allIds?: string[]): void {
    const currentState = this.state();

    // Cleanup: remove IDs that are no longer in the list
    const newSelected = new Set(currentState.selectedIds);
    if (allIds) {
      for (const id of newSelected) {
        if (!allIds.includes(id)) {
          newSelected.delete(id);
        }
      }
    }

    this.state.set({
      ...currentState,
      totalCount: count,
      selectedIds: newSelected,
      show: newSelected.size > 0,
      isAllSelected: newSelected.size === count && count > 0,
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

    const isAllSelected =
      newSelected.size === currentState.totalCount && currentState.totalCount > 0;

    this.state.set({
      ...currentState,
      selectedIds: newSelected,
      show: newSelected.size > 0,
      isAllSelected,
    });
  }

  /**
   * Select all items (called with the list of current IDs)
   */
  selectAll(ids: string[]): void {
    const currentState = this.state();
    this.state.set({
      ...currentState,
      selectedIds: new Set(ids),
      show: ids.length > 0,
      isAllSelected: true,
    });
  }

  /**
   * Toggle select all (requires IDs from view if selecting all)
   */
  toggleSelectAll(currentIds: string[]): void {
    const currentState = this.state();
    if (currentState.isAllSelected) {
      this.clearSelection();
    } else {
      this.selectAll(currentIds);
    }
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
