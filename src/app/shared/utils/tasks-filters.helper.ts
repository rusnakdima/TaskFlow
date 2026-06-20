import { Injectable, signal, computed } from "@angular/core";
import { Task } from "@entities/generated/api.types";
import { FilteredListHelper } from "@helpers/filtered-list.helper";
import { FilterField } from "@entities/filter-config.model";
@Injectable({ providedIn: "root" })
export class TasksFiltersHelper {
  private _activeFilters = signal<Record<string, string | string[] | any>>({});
  activeFilter = computed(() => {
    const filters = this._activeFilters();
    return (filters["status"] as string) || "all";
  });
  filterFields: FilterField[] = [
    {
      key: "status",
      label: "Status",
      type: "checkbox",
      options: [
        { key: "all", label: "All" },
        { key: "pending", label: "Pending" },
        { key: "completed", label: "Completed" },
        { key: "skipped", label: "Skipped" },
        { key: "failed", label: "Failed" },
      ],
    },
    {
      key: "priority",
      label: "Priority",
      type: "checkbox",
      options: [
        { key: "all", label: "All" },
        { key: "low", label: "Low" },
        { key: "medium", label: "Medium" },
        { key: "high", label: "High" },
      ],
    },
  ];
  filterOptions = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "completed", label: "Completed" },
    { key: "skipped", label: "Skipped" },
    { key: "failed", label: "Failed" },
    { key: "done", label: "Done" },
    { key: "high", label: "High Priority" },
  ];
  hasActiveFilters = computed(() => {
    const filters = this._activeFilters();
    return Object.keys(filters).length > 0;
  });
  onFiltersChange(filters: Record<string, string | string[] | any>): void {
    this._activeFilters.set(filters);
  }
  listTasks(todoTasks: Task[], searchQuery: string): Task[] {
    return FilteredListHelper.filterAndSort(todoTasks, {
      filter: this.activeFilter(),
      query: searchQuery,
      filterType: "status",
    });
  }
}
