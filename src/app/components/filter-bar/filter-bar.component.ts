/* sys lib */
import { CommonModule } from "@angular/common";
import {
  Component,
  EventEmitter,
  Input,
  Output,
  HostListener,
  signal,
  computed,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatRadioModule } from "@angular/material/radio";
import { MatSelectModule } from "@angular/material/select";
import { MatDatepickerModule } from "@angular/material/datepicker";
import { MatNativeDateModule } from "@angular/material/core";
import { MatFormFieldModule } from "@angular/material/form-field";

/* components */
import { FilterSidebarComponent } from "@components/filter-sidebar/filter-sidebar.component";

/* models */
import { FilterField, FilterFieldOption, FilterFieldType } from "@models/filter-config.model";

/**
 * Filter option interface (legacy support)
 */
export interface FilterOption {
  key: string;
  label: string;
  icon?: string;
  count?: number;
}

@Component({
  selector: "app-filter-bar",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatCheckboxModule,
    MatRadioModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatFormFieldModule,
    FilterSidebarComponent,
  ],
  templateUrl: "./filter-bar.component.html",
  styleUrls: [],
})
export class FilterBarComponent {
  @Input() filterOptions: FilterOption[] = [];
  @Input() fields: FilterField[] = [];
  @Input() activeFilter: string = "all";
  @Input() showFilter: boolean = false;
  @Input() searchQuery: string = "";
  @Input() filterLabel: string = "";
  @Input() filterGroupName: string = "";
  @Input() showBlueprintButton: boolean = false;

  @Output() filterChange = new EventEmitter<string>();
  @Output() filterToggle = new EventEmitter<void>();
  @Output() searchChange = new EventEmitter<string>();
  @Output() openBlueprints = new EventEmitter<void>();
  @Output() filtersChange = new EventEmitter<Record<string, string | string[] | any>>();

  activeFilters = signal<Record<string, string | string[] | any>>({});
  startDate: Date | null = null;
  endDate: Date | null = null;

  get useLegacyMode(): boolean {
    return this.filterOptions.length > 0 && this.fields.length === 0;
  }

  get hasActiveFilters(): boolean {
    if (this.searchQuery) return true;
    if (this.activeFilter && this.activeFilter !== "all") return true;
    const filters = this.activeFilters();
    return Object.keys(filters).some((key) => {
      const val = filters[key];
      if (Array.isArray(val)) return val.length > 0;
      return val && val !== "all";
    });
  }

  @HostListener("document:keydown.escape")
  handleEscapeKey() {
    if (this.showFilter) {
      this.closeSidebar();
    }
  }

  toggleFilter() {
    this.showFilter = !this.showFilter;
    this.filterToggle.emit();
  }

  onFilterChange(filter: string) {
    this.activeFilter = filter;
    this.filterChange.emit(filter);
  }

  onSearchChange(query: string) {
    this.searchQuery = query;
    this.searchChange.emit(query);
  }

  closeSidebar() {
    this.showFilter = false;
    this.filterToggle.emit();
  }

  clearAllFilters() {
    this.activeFilter = "all";
    this.searchQuery = "";
    this.activeFilters.set({});
    this.startDate = null;
    this.endDate = null;
    this.filterChange.emit("all");
    this.filtersChange.emit({});
  }

  clearSearch() {
    this.searchQuery = "";
    this.searchChange.emit("");
    this.filterChange.emit(this.activeFilter);
  }

  onOpenBlueprints() {
    this.openBlueprints.emit();
  }

  onFieldFilterChange(fieldKey: string, value: string | string[]) {
    this.activeFilters.update((filters) => ({
      ...filters,
      [fieldKey]: value,
    }));
    this.filtersChange.emit(this.activeFilters());
  }

  onFieldRadioChange(field: FilterField, optionKey: string) {
    this.activeFilters.update((filters) => ({
      ...filters,
      [field.key]: optionKey,
    }));
    this.filtersChange.emit(this.activeFilters());
  }

  onFieldCheckboxChange(field: FilterField, optionKey: string, checked: boolean) {
    this.activeFilters.update((filters) => {
      const current = (filters[field.key] as string[]) || [];
      const updated = checked ? [...current, optionKey] : current.filter((k) => k !== optionKey);
      return {
        ...filters,
        [field.key]: updated,
      };
    });
    this.filtersChange.emit(this.activeFilters());
  }

  isFieldOptionSelected(field: FilterField, optionKey: string): boolean {
    const filters = this.activeFilters();
    const value = filters[field.key];
    if (Array.isArray(value)) {
      return value.includes(optionKey);
    }
    return value === optionKey;
  }

  onDateRangeChange() {
    this.activeFilters.update((filters) => ({
      ...filters,
      dateRange: {
        start: this.startDate?.toISOString(),
        end: this.endDate?.toISOString(),
      },
    }));
    this.filtersChange.emit(this.activeFilters());
  }
}
