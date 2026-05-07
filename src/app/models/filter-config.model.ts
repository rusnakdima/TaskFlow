export type FilterControlType = "text" | "select" | "date";

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
