/* sys lib */
import { TaskStatus } from "@entities/generated/api.types";
import { AdminFilterState } from "@entities/admin-table.model";

/* helpers */
import { ObjectHelper } from "@helpers/object.helper";

/**
 * Filter configuration interface
 */
export interface FilterConfig {
  field: string;
  value: string | number | boolean | null;
  operator?:
    | "equals"
    | "contains"
    | "startsWith"
    | "endsWith"
    | "greaterThan"
    | "lessThan"
    | "isNull"
    | "isNotNull";
}

/**
 * FilterHelper - Centralized filter logic for all views
 *
 * Provides reusable filtering methods for arrays of data
 */
export class FilterHelper {
  /**
   * Apply a single filter to an array
   */
  static applyFilter<T>(data: T[], config: FilterConfig): T[] {
    const { field, value, operator = "contains" } = config;

    if (
      operator !== "isNull" &&
      operator !== "isNotNull" &&
      !value &&
      value !== 0 &&
      value !== false
    ) {
      return data;
    }

    return data.filter((item: T) => {
      const itemValue = ObjectHelper.getNestedValue(item, field);

      if (operator === "isNull") {
        return itemValue == null || itemValue === "";
      }
      if (operator === "isNotNull") {
        return itemValue != null && itemValue !== "";
      }

      if (itemValue == null || itemValue === undefined) {
        return false;
      }

      switch (operator) {
        case "equals":
          return itemValue === value;
        case "startsWith":
          return String(itemValue).toLowerCase().startsWith(String(value).toLowerCase());
        case "endsWith":
          return String(itemValue).toLowerCase().endsWith(String(value).toLowerCase());
        case "greaterThan":
          return (itemValue as number) > (value as number);
        case "lessThan":
          return (itemValue as number) < (value as number);
        case "contains":
        default:
          return String(itemValue).toLowerCase().includes(String(value).toLowerCase());
      }
    });
  }

  /**
   * Apply multiple filters to an array
   */
  static applyFilters<T>(data: T[], configs: FilterConfig[]): T[] {
    return configs.reduce((filteredData, config) => {
      return FilterHelper.applyFilter(filteredData, config);
    }, data);
  }

  /**
   * Filter by status
   */
  static filterByStatus<T extends { status: string }>(data: T[], status: string): T[] {
    if (!status || status === "all") {
      return data;
    }

    if (status === "done") {
      return data.filter(
        (item) =>
          item.status === "completed" || item.status === "skipped" || item.status === "failed"
      );
    }

    return data.filter((item) => item.status === status);
  }

  /**
   * Filter by priority
   */
  static filterByPriority<T extends { priority: string }>(data: T[], priority: string): T[] {
    if (!priority || priority === "all") {
      return data;
    }
    return data.filter((item) => item.priority === priority);
  }

  /**
   * Filter by completion status
   */
  static filterByCompletion<T extends { status: string }>(
    data: T[],
    completion: "all" | "active" | "completed"
  ): T[] {
    switch (completion) {
      case "active":
        return data.filter((item) => item.status === "pending");
      case "completed":
        return data.filter((item) => item.status === "completed" || item.status === "skipped");
      case "all":
      default:
        return data;
    }
  }

  /**
   * Filter this week
   */
  static filterThisWeek<T extends { start_date?: string | null; end_date?: string | null }>(
    data: T[]
  ): T[] {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    return data.filter((item) => {
      if (item.start_date && item.end_date) {
        const itemStart = new Date(item.start_date);
        const itemEnd = new Date(item.end_date);
        return itemStart <= endOfWeek && itemEnd >= startOfWeek;
      }
      return false;
    });
  }

  /**
   * Clear all filters
   */
  static clearFilters(): FilterConfig[] {
    return [];
  }

  /**
   * Admin-specific filter builder
   */
  static buildAdminFilterConfigs(filters: AdminFilterState, selectedType: string): FilterConfig[] {
    const filterConfigs: FilterConfig[] = [];

    if (filters.titleFilter) {
      filterConfigs.push({
        field: "title",
        value: filters.titleFilter,
        operator: "contains",
      });
    }

    if (filters.descriptionFilter) {
      filterConfigs.push({
        field: "description",
        value: filters.descriptionFilter,
        operator: "contains",
      });
    }

    if (filters.priorityFilter && filters.priorityFilter !== "") {
      filterConfigs.push({
        field: "priority",
        value: filters.priorityFilter,
        operator: "equals",
      });
    }

    // Status filter (active/deleted)
    if (filters.deletedFilter === "not_deleted") {
      filterConfigs.push({ field: "deleted_at", value: null, operator: "isNull" });
    } else if (filters.deletedFilter === "deleted") {
      filterConfigs.push({ field: "deleted_at", value: null, operator: "isNotNull" });
    }

    // Task/Subtask status filters
    if (selectedType === "tasks" || selectedType === "subtasks") {
      const statusValue = filters.isCompletedFilter;
      if (statusValue !== "done" && statusValue !== "all") {
        filterConfigs.push({
          field: "status",
          value: TaskStatus[statusValue.toUpperCase() as keyof typeof TaskStatus],
          operator: "equals",
        });
      }
    }

    // Visibility filter - only for todos
    if (
      selectedType === "todos" &&
      filters.visibilityFilter &&
      filters.visibilityFilter !== "all"
    ) {
      filterConfigs.push({
        field: "visibility",
        value: filters.visibilityFilter,
        operator: "equals",
      });
    }

    return filterConfigs;
  }

  /**
   * Apply admin-specific custom filters
   */
  static applyAdminCustomFilters<T extends object>(
    data: T[],
    filters: AdminFilterState,
    selectedType: string
  ): T[] {
    if (filters.userFilter) {
      data = this.applyUserFilter(data, filters.userFilter);
    }

    if (filters.categoriesFilter) {
      data = this.applyCategoriesFilter(data, filters.categoriesFilter);
    }

    if (filters.startDateFilter) {
      data = this.applyStartDateFilter(data, filters.startDateFilter);
    }

    if (filters.endDateFilter) {
      data = this.applyEndDateFilter(data, filters.endDateFilter);
    }

    if (filters.todoIdFilter && selectedType === "tasks") {
      data = this.applyTodoIdFilter(data, filters.todoIdFilter);
    }

    if (filters.taskIdFilter && selectedType === "subtasks") {
      data = this.applyTaskIdFilter(data, filters.taskIdFilter);
    }

    return data;
  }

  private static applyUserFilter<T>(data: T[], filter: string): T[] {
    return data.filter((item: T) => {
      const itemRecord = item as Record<string, unknown>;
      const user = itemRecord["user"] as Record<string, unknown> | undefined;
      const user_id = itemRecord["user_id"];
      if (user && user["id"] === filter) return true;
      if (user_id && user_id === filter) return true;
      const filterStr = filter.toLowerCase();
      const username = String(user?.["username"] || "").toLowerCase() || "";
      return username.includes(filterStr);
    });
  }

  private static applyCategoriesFilter<T>(data: T[], filter: string): T[] {
    return data.filter((item: T) => {
      const itemRecord = item as Record<string, unknown>;
      const categories = itemRecord["categories"];
      if (categories && Array.isArray(categories)) {
        return categories.some((cat: unknown) =>
          typeof cat === "object" ? (cat as { id?: string })["id"] === filter : cat === filter
        );
      }
      const categoryId = itemRecord["categoryId"];
      if (categoryId && categoryId === filter) return true;
      return false;
    });
  }

  private static applyStartDateFilter<T>(data: T[], filterDate: string): T[] {
    const date = new Date(filterDate);
    return data.filter((item: T) => {
      const itemRecord = item as Record<string, unknown>;
      const itemDate = new Date((itemRecord["start_date"] || itemRecord["created_at"]) as string);
      return itemDate >= date;
    });
  }

  private static applyEndDateFilter<T>(data: T[], filterDate: string): T[] {
    const date = new Date(filterDate);
    return data.filter((item: T) => {
      const itemRecord = item as Record<string, unknown>;
      const itemDate = new Date((itemRecord["end_date"] || itemRecord["created_at"]) as string);
      return itemDate <= date;
    });
  }

  private static applyTodoIdFilter<T>(data: T[], todoId: string): T[] {
    return data.filter((item: T) => {
      return (item as Record<string, unknown>)["todo_id"] === todoId;
    });
  }

  private static applyTaskIdFilter<T>(data: T[], taskId: string): T[] {
    return data.filter((item: T) => {
      return (item as Record<string, unknown>)["task_id"] === taskId;
    });
  }

  /**
   * Admin-specific status filtering (uses TaskStatus enum logic)
   */
  static filterAdminByStatus<T extends object>(data: T[], statusFilter: string): T[] {
    if (statusFilter === "done") {
      return data.filter((item) =>
        [TaskStatus.COMPLETED, TaskStatus.SKIPPED].includes(
          (item as Record<string, unknown>)["status"] as TaskStatus
        )
      );
    } else if (statusFilter !== "all") {
      const filterConfigs: FilterConfig[] = [
        {
          field: "status",
          value: TaskStatus[statusFilter.toUpperCase() as keyof typeof TaskStatus],
          operator: "equals",
        },
      ];
      return FilterHelper.applyFilters(data, filterConfigs);
    }
    return data;
  }

  /**
   * Get default admin filter state
   */
  static getDefaultAdminFilterState(): AdminFilterState {
    return {
      titleFilter: "",
      descriptionFilter: "",
      priorityFilter: "",
      startDateFilter: "",
      endDateFilter: "",
      statusFilter: "active",
      isCompletedFilter: "all",
      userFilter: "",
      categoriesFilter: "",
      todoIdFilter: "",
      taskIdFilter: "",
      visibilityFilter: "all",
      deletedFilter: "all",
      sortBy: "createdAt",
      sortOrder: "desc",
    };
  }
}
