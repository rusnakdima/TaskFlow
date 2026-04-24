import { Injectable, signal, computed, inject } from "@angular/core";
import { BulkActionService } from "./bulk-action.service";

@Injectable({ providedIn: "root" })
export class SelectionService {
  private _selectedIds = signal<Set<string>>(new Set());
  private bulkService = inject(BulkActionService);

  readonly selectedCount = computed(() => this._selectedIds().size);
  readonly selectedIds = this._selectedIds.asReadonly();

  toggleSelection(id: string, selected: boolean): void {
    this._selectedIds.update((ids) => {
      const newSelected = new Set(ids);
      if (selected) {
        newSelected.add(id);
      } else {
        newSelected.delete(id);
      }
      return newSelected;
    });
  }

  selectAll(ids: string[]): void {
    this._selectedIds.set(new Set(ids));
    this.bulkService.setSelectionState(ids.length, true);
  }

  clearSelection(): void {
    this._selectedIds.set(new Set());
    this.bulkService.setSelectionState(0, false);
  }

  isAllSelected(currentIds: string[]): boolean {
    if (currentIds.length === 0) return false;
    return currentIds.every((id) => this._selectedIds().has(id));
  }

  isSelected(id: string): boolean {
    return this._selectedIds().has(id);
  }

  getSelectedIds(): string[] {
    return Array.from(this._selectedIds());
  }
}
