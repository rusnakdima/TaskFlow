import {
  Component,
  Input,
  ChangeDetectionStrategy,
  forwardRef,
  signal,
  Output,
  EventEmitter,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatIconModule } from "@angular/material/icon";
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";
import { Category } from "@models/generated/api.types";
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

export interface CategorySectionValue {
  selectedIds: string[];
  searchQuery: string;
}

@Component({
  selector: "app-category-section",
  standalone: true,
  imports: [CommonModule, MatFormFieldModule, MatInputModule, MatIconModule, CheckboxComponent],
  templateUrl: "./category-section.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CategorySectionComponent),
      multi: true,
    },
  ],
})
export class CategorySectionComponent implements ControlValueAccessor {
  @Input() categories: Category[] = [];
  @Input() disabled = false;

  @Output() addCategory = new EventEmitter<void>();
  @Output() searchQueryChange = new EventEmitter<string>();
  @Output() toggleSelection = new EventEmitter<string>();
  @Output() toggleSelectAll = new EventEmitter<void>();

  @Input()
  get selectedIds(): Set<string> {
    return this._selectedIds();
  }
  set selectedIds(value: Set<string>) {
    this._selectedIds.set(value);
  }

  @Input()
  get searchQuery(): string {
    return this._searchQuery();
  }
  set searchQuery(value: string) {
    this._searchQuery.set(value);
  }

  @Input()
  get filteredCategories(): Category[] {
    const query = this._searchQuery().toLowerCase();
    if (!query) return this.categories;
    return this.categories.filter((c) => c.title.toLowerCase().includes(query));
  }

  @Input()
  get isAllSelected(): boolean {
    return this.categories.length > 0 && this._selectedIds().size === this.categories.length;
  }

  private _selectedIds = signal<Set<string>>(new Set());
  private _searchQuery = signal("");

  private onChange: (value: CategorySectionValue) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(obj: CategorySectionValue): void {
    if (obj) {
      this._selectedIds.set(new Set(obj.selectedIds ?? []));
      this._searchQuery.set(obj.searchQuery ?? "");
    }
  }

  registerOnChange(fn: (value: CategorySectionValue) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onSearchQueryChange(value: string): void {
    this._searchQuery.set(value);
    this.searchQueryChange.emit(value);
    this.emitChange();
  }

  onAddCategory(): void {
    this.addCategory.emit();
  }

  onToggleSelectAll(): void {
    const allIds = this.categories.map((c: Category) => c.id);
    const currentSelected = this._selectedIds();
    if (currentSelected.size === allIds.length) {
      this._selectedIds.set(new Set());
    } else {
      this._selectedIds.set(new Set(allIds));
    }
    this.toggleSelectAll.emit();
    this.emitChange();
    this.onTouched();
  }

  onToggleSelection(categoryId: string): void {
    const selected = new Set(this._selectedIds());
    if (selected.has(categoryId)) {
      selected.delete(categoryId);
    } else {
      selected.add(categoryId);
    }
    this._selectedIds.set(selected);
    this.toggleSelection.emit(categoryId);
    this.emitChange();
    this.onTouched();
  }

  isSelected(categoryId: string): boolean {
    return this._selectedIds().has(categoryId);
  }

  private emitChange(): void {
    this.onChange({
      selectedIds: Array.from(this._selectedIds()),
      searchQuery: this._searchQuery(),
    });
  }
}
