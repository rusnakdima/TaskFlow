export type FilterControlType = "text" | "select" | "date";
export type FilterFieldType = FilterControlType | "radio" | "checkbox" | "date-range";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterConfig {
  key: string;
  label: string;
  controlType: FilterControlType;
  placeholder?: string;
  options?: FilterOption[];
  dynamicListKey?: string;
  dataType?: string[];
}

export interface FilterField {
  key: string;
  label: string;
  type: FilterFieldType;
  icon?: string;
  options?: FilterFieldOption[];
  placeholder?: string;
}

export interface FilterFieldOption {
  key: string;
  label: string;
  icon?: string;
  count?: number;
}
