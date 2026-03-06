/**
 * Filter options for list views
 */
export interface FilterOption {
  key: string;
  label: string;
}

export const DEFAULT_FILTER_OPTIONS: FilterOption[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "skipped", label: "Skipped" },
  { key: "failed", label: "Failed" },
  { key: "done", label: "Done" },
  { key: "high", label: "High Priority" },
];

export const TASK_FILTER_OPTIONS: FilterOption[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed", label: "Completed" },
  { key: "skipped", label: "Skipped" },
  { key: "failed", label: "Failed" },
];

export const TODO_FILTER_OPTIONS: FilterOption[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
];
