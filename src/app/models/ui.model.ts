import { ViewMode } from "./view-mode.model";
import { FilterField } from "./filter-config.model";

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
  filters?: Array<{ key: string; label: string; value: any }>;
  activeFilter?: string;
  isActive?: boolean;
  onToggle?: () => void;
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
