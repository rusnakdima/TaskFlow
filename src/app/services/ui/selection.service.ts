import { Injectable, signal, WritableSignal } from "@angular/core";

@Injectable({ providedIn: "root" })
export class SelectionService {
  private selectionMap = new Map<string, WritableSignal<Set<string>>>();

  getSelectionSignal(pageKey: string): WritableSignal<Set<string>> {
    if (!this.selectionMap.has(pageKey)) {
      this.selectionMap.set(pageKey, signal(new Set<string>()));
    }
    return this.selectionMap.get(pageKey)!;
  }

  getSelection(pageKey: string): Set<string> {
    return this.getSelectionSignal(pageKey)();
  }

  updateSelection(pageKey: string, updater: (selection: Set<string>) => Set<string>): void {
    this.getSelectionSignal(pageKey).update(updater);
  }

  toggle(selection: Set<string>, id: string): Set<string> {
    const newSelected = new Set(selection);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    return newSelected;
  }

  selectAll(items: { id: string }[]): Set<string> {
    return new Set(items.map((item) => item.id));
  }

  clearSelection(): Set<string> {
    return new Set();
  }

  isAllSelected(selected: Set<string>, items: { id: string }[]): boolean {
    return items.length > 0 && items.every((item) => selected.has(item.id));
  }
}
