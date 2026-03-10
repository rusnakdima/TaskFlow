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

export interface AdminFilterState {
  titleFilter: string;
  descriptionFilter: string;
  priorityFilter: string;
  startDateFilter: string;
  endDateFilter: string;
  statusFilter: string;
  isCompletedFilter: string;
  userFilter: string;
  categoriesFilter: string;
  todoIdFilter: string;
  taskIdFilter: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
}
