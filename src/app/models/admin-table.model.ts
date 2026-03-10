export type AdminFieldType =
  | "text"
  | "date"
  | "chip"
  | "priority"
  | "status"
  | "user"
  | "array-count";

export interface AdminFieldConfig {
  key: string;
  label: string;
  type: AdminFieldType;
  getValue?: (item: any) => any;
  getChipColor?: (value: any) => string;
  getChipText?: (value: any) => string;
}
