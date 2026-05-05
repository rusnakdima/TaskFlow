import { TemplateRef } from "@angular/core";

export type TableFieldType =
  | "text"
  | "date"
  | "datetime"
  | "chip"
  | "priority"
  | "status"
  | "user"
  | "array-count"
  | "number"
  | "boolean"
  | "select"
  | "actions"
  | "expand"
  | "change";

export interface TableFieldColorConfig {
  positive?: string;
  negative?: string;
  neutral?: string;
  true?: string;
  false?: string;
  default?: string;
}

export interface TableFieldIconConfig {
  positive?: string;
  negative?: string;
  neutral?: string;
  true?: string;
  false?: string;
  default?: string;
}

export interface TableFieldActionButton {
  key: string;
  icon: string;
  label: string;
  template?: TemplateRef<any>;
}

export interface TableField {
  key: string;
  label: string;
  type: TableFieldType;
  sortable?: boolean;
  width?: string;
  options?: { value: string; label: string }[];
  getValue?: (item: any) => any;
  getChipColor?: (value: any) => string;
  getChipText?: (value: any) => string;
  getSortValue?: (item: any) => any;
  colorConfig?: TableFieldColorConfig;
  iconConfig?: TableFieldIconConfig;
}
