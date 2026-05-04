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
  | "expand";

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
}
