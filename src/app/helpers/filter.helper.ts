/* sys lib */
import { TaskStatus } from "@models/task.model";
import { AdminFilterState } from "@models/admin-table.model";

/* helpers */
import { ObjectHelper } from "@helpers/object.helper";

/**
 * Filter configuration interface
 */
export interface FilterConfig {
  field: string;
  value: any;
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
          return itemValue > value;
        case "lessThan":
          return itemValue < value;
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
  static applyAdminCustomFilters(
    data: any[],
    filters: AdminFilterState,
    selectedType: string
  ): any[] {
    if (filters.userFilter) {
      const filter = filters.userFilter;
      data = data.filter((item) => {
        if (item.user && item.user.id === filter) return true;
        if (item.user_id && item.user_id === filter) return true;
        // Fallback for search
        const filterStr = filter.toLowerCase();
        const username = item.user?.username?.toLowerCase() || "";
        return username.includes(filterStr);
      });
    }

    if (filters.categoriesFilter) {
      const filter = filters.categoriesFilter;
      data = data.filter((item) => {
        // Case: categories is an array of objects (check ID)
        if (item.categories && Array.isArray(item.categories)) {
          return item.categories.some((cat: any) =>
            typeof cat === "object" ? cat.id === filter : cat === filter
          );
        }
        // Case: item has a direct categoryId field
        if (item.categoryId && item.categoryId === filter) return true;

        return false;
      });
    }

    if (filters.startDateFilter) {
      const filterDate = new Date(filters.startDateFilter);
      data = data.filter((item) => {
        const itemDate = new Date(item.start_date || item.created_at);
        return itemDate >= filterDate;
      });
    }

    if (filters.endDateFilter) {
      const filterDate = new Date(filters.endDateFilter);
      data = data.filter((item) => {
        const itemDate = new Date(item.end_date || item.created_at);
        return itemDate <= filterDate;
      });
    }

    if (filters.todoIdFilter && selectedType === "tasks") {
      data = data.filter((item) => {
        return item.todo_id === filters.todoIdFilter;
      });
    }

    if (filters.taskIdFilter && selectedType === "subtasks") {
      data = data.filter((item) => {
        return item.task_id === filters.taskIdFilter;
      });
    }

    return data;
  }

  /**
   * Admin-specific status filtering (uses TaskStatus enum logic)
   */
  static filterAdminByStatus(data: any[], statusFilter: string): any[] {
    if (statusFilter === "done") {
      return data.filter((item) =>
        [TaskStatus.COMPLETED, TaskStatus.SKIPPED].includes(item.status)
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
