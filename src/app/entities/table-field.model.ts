export type TableFieldType =
  | "text"
  | "status"
  | "priority"
  | "chip"
  | "datetime"
  | "expand"
  | "checkbox"
  | "actions"
  | "assignee"
  | "category"
  | "number"
  | "boolean"
  | "date"
  | "select"
  | "change"
  | "user"
  | "array-count"
  | "progress-bar";

export interface TableFieldColorConfig {
  bgClass?: string;
  textClass?: string;
}

export interface TableFieldIconConfig {
  icon?: string;
  position?: "left" | "right";
}

export interface TableFieldActionButton<T = Record<string, unknown>> {
  id?: string;
  key?: string;
  label: string;
  icon?: string;
  template?: string;
  callback?: (item: T) => void;
  showIf?: (item: T) => boolean;
}

export interface TableField<T = Record<string, unknown>> {
  key: string;
  label: string;
  type: TableFieldType;
  sortable?: boolean;
  width?: string;
  options?: Array<{ value: string; label: string }>;
  getValue?: (item: T) => string;
  getSortValue?: (item: T) => string | number;
  getChipColor?: (item: T) => string;
  getChipText?: (item: T) => string;
  getIconConfig?: (item: T) => TableFieldIconConfig;
  iconConfig?: TableFieldIconConfig & { default?: string };
  colorConfig?: TableFieldColorConfig & { default?: string };
  onClick?: (item: T) => void;
  actionButtons?: TableFieldActionButton<T>[];
  size?: "sm" | "md" | "lg";
}
