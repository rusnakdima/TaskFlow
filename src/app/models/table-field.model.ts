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

export interface TableFieldActionButton {
  id?: string;
  key?: string;
  label: string;
  icon?: string;
  template?: string;
  callback?: (item: any) => void;
  showIf?: (item: any) => boolean;
}

export interface TableField {
  key: string;
  label: string;
  type: TableFieldType;
  sortable?: boolean;
  width?: string;
  options?: Array<{ value: string; label: string }>;
  getValue?: (item: any) => string;
  getSortValue?: (item: any) => string | number;
  getChipColor?: (item: any) => string;
  getChipText?: (item: any) => string;
  getIconConfig?: (item: any) => TableFieldIconConfig;
  iconConfig?: TableFieldIconConfig & { default?: string };
  colorConfig?: TableFieldColorConfig & { default?: string };
  onClick?: (item: any) => void;
  actionButtons?: TableFieldActionButton[];
  size?: "sm" | "md" | "lg";
}
