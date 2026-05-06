import { Injectable, signal, WritableSignal } from "@angular/core";

@Injectable({ providedIn: "root" })
export class SelectionService {
  private selectionMap = new Map<
    string,
    { signal: WritableSignal<Set<string>>; timestamp: number }
  >();
  private readonly SELECTION_TTL = 10 * 60 * 1000; // 10 minutes
  private readonly MAX_SELECTIONS = 50;

  private cleanupSelections(): void {
    const now = Date.now();
    for (const [key, entry] of this.selectionMap.entries()) {
      if (now - entry.timestamp > this.SELECTION_TTL) {
        this.selectionMap.delete(key);
      }
    }
    while (this.selectionMap.size > this.MAX_SELECTIONS) {
      const oldestKey = this.selectionMap.keys().next().value;
      if (oldestKey) {
        this.selectionMap.delete(oldestKey);
      }
    }
  }

  getSelectionSignal(pageKey: string): WritableSignal<Set<string>> {
    this.cleanupSelections();

    if (!this.selectionMap.has(pageKey)) {
      this.selectionMap.set(pageKey, { signal: signal(new Set<string>()), timestamp: Date.now() });
    } else {
      this.selectionMap.get(pageKey)!.timestamp = Date.now();
    }
    return this.selectionMap.get(pageKey)!.signal;
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

  clearSelection(pageKey?: string): void {
    if (pageKey) {
      this.selectionMap.delete(pageKey);
    } else {
      this.selectionMap.clear();
    }
  }

  isAllSelected(selected: Set<string>, items: { id: string }[]): boolean {
    return items.length > 0 && items.every((item) => selected.has(item.id));
  }
}
