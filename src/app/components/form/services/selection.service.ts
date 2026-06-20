import { Injectable, signal, computed } from "@angular/core";
import { ControlValueAccessor } from "@angular/forms";
export interface SelectionState<T = string> {
  items: T[];
  selectedIds: Set<string>;
  searchQuery: string;
  disabled: boolean;
}
@Injectable()
export class SelectionService<T = string> implements ControlValueAccessor {
  private items = signal<T[]>([]);
  private selectedIds = signal<Set<string>>(new Set());
  private searchQuery = signal("");
  private disabled = signal(false);
  private onChange: (value: string[]) => void = () => {};
  private onTouched: () => void = () => {};
  readonly filteredItems = computed(() => {
    const query = this.searchQuery().toLowerCase();
    if (!query) return this.items();
    return this.items().filter((item) => this.getItemId(item).toLowerCase().includes(query));
  });
  readonly isAllSelected = computed(() => {
    const items = this.items();
    const selected = this.selectedIds();
    return items.length > 0 && selected.size === items.length;
  });
  readonly selectedCount = computed(() => this.selectedIds().size);
  writeValue(obj: string[]): void {
    if (Array.isArray(obj)) {
      this.selectedIds.set(new Set(obj.filter((id) => id)));
    }
  }
  registerOnChange(fn: (value: string[]) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
  setItems(items: T[], _getId: (item: T) => string): void {
    this.items.set(items);
  }
  getSelectedIds(): string[] {
    return Array.from(this.selectedIds());
  }
  getSelectedIdsSet(): Set<string> {
    return this.selectedIds();
  }
  setSearchQuery(query: string): void {
    this.searchQuery.set(query);
  }
  getSearchQuery(): string {
    return this.searchQuery();
  }
  isDisabled(): boolean {
    return this.disabled();
  }
  toggleSelection(itemId: string): void {
    const selected = new Set(this.selectedIds());
    if (selected.has(itemId)) {
      selected.delete(itemId);
    } else {
      selected.add(itemId);
    }
    this.selectedIds.set(selected);
    this.onChange(Array.from(selected));
    this.onTouched();
  }
  toggleSelectAll(getId: (item: T) => string): void {
    const allIds = this.items().map(getId);
    const currentSelected = this.selectedIds();
    if (currentSelected.size === allIds.length) {
      this.selectedIds.set(new Set());
    } else {
      this.selectedIds.set(new Set(allIds));
    }
    this.onChange(Array.from(this.selectedIds()));
    this.onTouched();
  }
  isSelected(itemId: string): boolean {
    return this.selectedIds().has(itemId);
  }
  protected getItemId(item: T): string {
    return item as unknown as string;
  }
  protected getItems(): T[] {
    return this.items();
  }
}
