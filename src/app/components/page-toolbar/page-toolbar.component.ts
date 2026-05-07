import { Component, Input, Output, EventEmitter, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatMenuModule } from "@angular/material/menu";
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";
import { ViewModeSwitcherComponent } from "@components/view-mode-switcher/view-mode-switcher.component";
import { ViewMode } from "@components/view-mode-switcher/view-mode-switcher.component";
import { FilterSidebarComponent } from "@components/filter-sidebar/filter-sidebar.component";
import { FilterField, FilterConfig, FilterOption } from "@models/filter-config.model";

export interface SelectAllConfig {
  onToggle: () => void;
  isAllSelected: boolean;
  count: number;
  highlight: boolean;
}

export interface StatsConfig {
  onToggle: () => void;
  isActive: boolean;
}

export interface ToolbarFilterConfig {
  onToggle: () => void;
  isActive: boolean;
}

export interface NewButtonConfig {
  onClick: () => void;
  label?: string;
  icon?: string;
}

export interface NewButtonWithMenuConfig {
  label: string;
  icon?: string;
  menuItems: {
    label: string;
    icon?: string;
    action: () => void;
  }[];
}

export interface InfoToggleConfig {
  onToggle: () => void;
  isActive: boolean;
  label?: string;
}

export interface RefreshConfig {
  onClick: () => void;
  loading: boolean;
}

export interface SortMenuConfig {
  sortBy: string;
  sortOrder: "asc" | "desc";
  sortOptions: {
    key: string;
    label: string;
    icon?: string;
  }[];
  onSort: (key: string) => void;
}

export interface SortOrderConfig {
  onToggle: () => void;
  currentOrder: "asc" | "desc";
}

export interface SearchConfig {
  query: string;
  placeholder?: string;
  onSearch: (query: string) => void;
}

export interface PageToolbarConfig {
  selectAll?: SelectAllConfig;
  stats?: StatsConfig;
  filter?: ToolbarFilterConfig;
  newButton?: NewButtonConfig;
  newButtonWithMenu?: NewButtonWithMenuConfig;
  infoToggle?: InfoToggleConfig;
  refresh?: RefreshConfig;
  sortMenu?: SortMenuConfig;
  sortOrder?: SortOrderConfig;
  search?: SearchConfig;
  viewMode?: {
    mode: ViewMode;
    pageKey: string;
    onModeChange: (mode: ViewMode) => void;
  };
  filterFields?: FilterField[];
  showFilter?: boolean;
  activeFilters?: Record<string, string | string[] | any>;
  onFiltersChange?: (filters: Record<string, string | string[] | any>) => void;
}

@Component({
  selector: "app-page-toolbar",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    CheckboxComponent,
    ViewModeSwitcherComponent,
    FilterSidebarComponent,
  ],
  templateUrl: "./page-toolbar.component.html",
})
export class PageToolbarComponent {
  @Input() config: PageToolbarConfig | null = null;
  @Input() filterFields: FilterField[] = [];
  @Input() searchQuery: string = "";

  showFilter = signal(false);

  @Output() filtersChange = new EventEmitter<Record<string, string | string[] | any>>();
  @Output() searchChange = new EventEmitter<string>();

  onToggleFilter(): void {
    this.showFilter.update((v) => !v);
    if (this.config?.filter) {
      this.config.filter.onToggle();
    }
    this.filterToggle.emit();
  }

  @Output() filterToggle = new EventEmitter<void>();

  private activeFilters = signal<Record<string, string>>({});

  onFiltersChange(event: { key: string; value: string }): void {
    this.activeFilters.update((filters) => ({
      ...filters,
      [event.key]: event.value,
    }));
    this.filtersChange.emit(this.activeFilters());
  }

  onClearFilters(): void {
    this.activeFilters.set({});
    this.filtersChange.emit({});
  }

  getFilterConfigs(): FilterConfig[] {
    return this.filterFields
      .filter((field) => field.type !== "date-range")
      .map((field) => {
        let controlType: "text" | "select" | "date" = "text";
        if (field.type === "radio" || field.type === "checkbox" || field.type === "select") {
          controlType = "select";
        } else if (field.type === "date") {
          controlType = "date";
        }
        return {
          key: field.key,
          label: field.label,
          controlType,
          options:
            field.options?.map((opt) => ({
              value: opt.key,
              label: opt.label,
            })) || [],
        };
      });
  }

  getFilterValues(): Record<string, string> {
    return this.activeFilters();
  }

  getDynamicOptionsFn = (key: string, filter: any): FilterOption[] => {
    const field = this.filterFields.find((f) => f.key === key);
    if (field?.options) {
      return field.options.map((opt) => ({
        value: opt.key,
        label: opt.label,
      }));
    }
    return [];
  };

  onFiltersChangeEvent(filters: Record<string, string | string[] | any>): void {
    this.filtersChange.emit(filters);
  }

  onSearchChangeEvent(query: string): void {
    this.searchChange.emit(query);
  }

  onFilterChange(filter: string): void {
    if (this.config?.filter) {
      this.config.filter.onToggle();
    }
  }
}
