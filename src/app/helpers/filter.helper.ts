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
  operator?: "equals" | "contains" | "startsWith" | "endsWith" | "greaterThan" | "lessThan";
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

    if (!value && value !== 0 && value !== false) {
      return data;
    }

    return data.filter((item: any) => {
      const itemValue = ObjectHelper.getNestedValue(item, field);

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
  static filterThisWeek<T extends { startDate?: string; endDate?: string }>(data: T[]): T[] {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    return data.filter((item) => {
      if (item.startDate && item.endDate) {
        const itemStart = new Date(item.startDate);
        const itemEnd = new Date(item.endDate);
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
    if (filters.statusFilter === "active") {
      filterConfigs.push({ field: "deleted_at", value: false, operator: "equals" });
    } else if (filters.statusFilter === "deleted") {
      filterConfigs.push({ field: "deleted_at", value: true, operator: "equals" });
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
      const filter = filters.userFilter.toLowerCase();
      data = data.filter((item) => {
        if ((selectedType === "todos" || selectedType === "categories") && item.user) {
          const { profile, username } = item.user;
          const firstName = profile?.name?.toLowerCase() || "";
          const lastName = profile?.lastName?.toLowerCase() || "";
          const userName = username?.toLowerCase() || "";
          return (
            firstName.includes(filter) || lastName.includes(filter) || userName.includes(filter)
          );
        }
        return false;
      });
    }

    if (filters.categoriesFilter && selectedType === "todos") {
      const filter = filters.categoriesFilter.toLowerCase();
      data = data.filter((item) => {
        if (item.categories && Array.isArray(item.categories)) {
          return item.categories.some((cat: any) => cat.title?.toLowerCase().includes(filter));
        }
        return false;
      });
    }

    if (filters.startDateFilter) {
      const filterDate = new Date(filters.startDateFilter);
      data = data.filter((item) => {
        const itemDate = new Date(item.startDate || item.created_at);
        return itemDate >= filterDate;
      });
    }

    if (filters.endDateFilter) {
      const filterDate = new Date(filters.endDateFilter);
      data = data.filter((item) => {
        const itemDate = new Date(item.endDate || item.created_at);
        return itemDate <= filterDate;
      });
    }

    if (filters.todoIdFilter && selectedType === "tasks") {
      data = data.filter((item) => {
        return item.todoId === filters.todoIdFilter;
      });
    }

    if (filters.taskIdFilter && selectedType === "subtasks") {
      data = data.filter((item) => {
        return item.taskId === filters.taskIdFilter;
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
      statusFilter: "all",
      isCompletedFilter: "all",
      userFilter: "",
      categoriesFilter: "",
      todoIdFilter: "",
      taskIdFilter: "",
      sortBy: "created_at",
      sortOrder: "desc",
    };
  }
}
