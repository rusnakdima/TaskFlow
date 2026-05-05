import { Component, Input, Output, EventEmitter } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatMenuModule } from "@angular/material/menu";
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";
import { ViewModeSwitcherComponent } from "@components/view-mode-switcher/view-mode-switcher.component";
import { ViewMode } from "@components/view-mode-switcher/view-mode-switcher.component";
import { FilterBarComponent } from "@components/filter-bar/filter-bar.component";
import { FilterField } from "@models/filter-config.model";

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

export interface FilterConfig {
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

export interface PageToolbarConfig {
  selectAll?: SelectAllConfig;
  stats?: StatsConfig;
  filter?: FilterConfig;
  newButton?: NewButtonConfig;
  newButtonWithMenu?: NewButtonWithMenuConfig;
  infoToggle?: InfoToggleConfig;
  refresh?: RefreshConfig;
  sortMenu?: SortMenuConfig;
  sortOrder?: SortOrderConfig;
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
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    CheckboxComponent,
    ViewModeSwitcherComponent,
    FilterBarComponent,
  ],
  templateUrl: "./page-toolbar.component.html",
})
export class PageToolbarComponent {
  @Input() config: PageToolbarConfig | null = null;
  @Input() filterFields: FilterField[] = [];
  @Input() showFilter: boolean = false;
  @Input() activeFilters: Record<string, string | string[] | any> = {};
  @Input() activeFilter: string = "all";
  @Input() searchQuery: string = "";

  @Output() filtersChange = new EventEmitter<Record<string, string | string[] | any>>();
  @Output() filterToggle = new EventEmitter<void>();
  @Output() searchChange = new EventEmitter<string>();

  onToggleFilter(): void {
    this.filterToggle.emit();
  }

  onFiltersChange(filters: Record<string, string | string[] | any>): void {
    this.filtersChange.emit(filters);
  }

  onSearchChange(query: string): void {
    this.searchChange.emit(query);
  }

  onFilterChange(filter: string): void {
    if (this.config?.filter) {
      this.config.filter.onToggle();
    }
  }
}
