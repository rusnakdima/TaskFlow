export type FilterFieldType = "radio" | "checkbox" | "select" | "date-range";

export interface FilterFieldOption {
  key: string;
  label: string;
  icon?: string;
  count?: number;
}

export interface FilterField {
  key: string;
  label: string;
  type: FilterFieldType;
  options?: FilterFieldOption[];
  placeholder?: string;
}

export interface FilterConfig {
  fields: FilterField[];
  activeFilters: Record<string, string | string[]>;
  searchQuery: string;
}
