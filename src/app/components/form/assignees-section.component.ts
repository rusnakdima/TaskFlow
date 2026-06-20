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
import { MatIconModule } from "@angular/material/icon";
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";
import { Profile } from "@entities/generated/api.types";
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";
import { UserAvatarComponent } from "@components/user-avatar/user-avatar.component";
export interface AssigneesSectionValue {
  selectedIds: string[];
  searchQuery: string;
}
@Component({
  selector: "app-assignees-section",
  standalone: true,
  imports: [CommonModule, MatIconModule, CheckboxComponent, UserAvatarComponent],
  templateUrl: "./assignees-section.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AssigneesSectionComponent),
      multi: true,
    },
  ],
})
export class AssigneesSectionComponent implements ControlValueAccessor {
  @Input() assignees: Profile[] = [];
  @Input() disabled = false;
  @Input() currentUserId = "";
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
  get filteredAssignees(): Profile[] {
    const query = this._searchQuery().toLowerCase();
    if (!query) return this.assignees;
    return this.assignees.filter(
      (p) =>
        `${p.name} ${p.last_name}`.toLowerCase().includes(query) ||
        (p.user?.email || "").toLowerCase().includes(query)
    );
  }
  @Input()
  get isAllSelected(): boolean {
    return this.assignees.length > 0 && this._selectedIds().size === this.assignees.length;
  }
  private _selectedIds = signal<Set<string>>(new Set());
  private _searchQuery = signal("");
  private onChange: (value: AssigneesSectionValue) => void = () => {};
  private onTouched: () => void = () => {};
  writeValue(obj: AssigneesSectionValue): void {
    if (obj) {
      this._selectedIds.set(new Set(obj.selectedIds ?? []));
      this._searchQuery.set(obj.searchQuery ?? "");
    }
  }
  registerOnChange(fn: (value: AssigneesSectionValue) => void): void {
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
  clearSearch(): void {
    this._searchQuery.set("");
    this.emitChange();
  }
  onToggleSelectAll(): void {
    const allIds = this.assignees.map((p: Profile) => p.user_id);
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
  onToggleSelection(profileId: string): void {
    const selected = new Set(this._selectedIds());
    if (selected.has(profileId)) {
      selected.delete(profileId);
    } else {
      selected.add(profileId);
    }
    this._selectedIds.set(selected);
    this.toggleSelection.emit(profileId);
    this.emitChange();
    this.onTouched();
  }
  isSelected(id: string): boolean {
    return this._selectedIds().has(id);
  }
  private emitChange(): void {
    this.onChange({
      selectedIds: Array.from(this._selectedIds()),
      searchQuery: this._searchQuery(),
    });
  }
}
