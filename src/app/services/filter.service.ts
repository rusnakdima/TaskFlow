/* sys lib */
import { Injectable } from "@angular/core";

/**
 * Filter configuration interface
 */
export interface FilterConfig {
  field: string;
  value: any;
  operator?: "equals" | "contains" | "startsWith" | "endsWith" | "greaterThan" | "lessThan";
}

/**
 * FilterService - Centralized filter logic for all views
 *
 * Provides reusable filtering methods for arrays of data
 */
@Injectable({
  providedIn: "root",
})
export class FilterService {
  /**
   * Apply a single filter to an array
   */
  applyFilter<T>(data: T[], config: FilterConfig): T[] {
    const { field, value, operator = "contains" } = config;

    if (!value && value !== 0 && value !== false) {
      return data;
    }

    return data.filter((item: any) => {
      const itemValue = this.getNestedValue(item, field);

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
  applyFilters<T>(data: T[], configs: FilterConfig[]): T[] {
    return configs.reduce((filteredData, config) => {
      return this.applyFilter(filteredData, config);
    }, data);
  }

  /**
   * Filter by status
   */
  filterByStatus<T extends { status: string }>(data: T[], status: string): T[] {
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
  filterByPriority<T extends { priority: string }>(data: T[], priority: string): T[] {
    if (!priority || priority === "all") {
      return data;
    }
    return data.filter((item) => item.priority === priority);
  }

  /**
   * Filter by date range
   */
  filterByDateRange<T>(data: T[], field: string, startDate?: string, endDate?: string): T[] {
    if (!startDate && !endDate) {
      return data;
    }

    return data.filter((item: any) => {
      const itemDate = new Date(this.getNestedValue(item, field));

      if (startDate && itemDate < new Date(startDate)) {
        return false;
      }

      if (endDate && itemDate > new Date(endDate)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Filter by search query (searches multiple fields)
   */
  filterBySearch<T>(data: T[], query: string, fields: string[]): T[] {
    if (!query || query.trim() === "") {
      return data;
    }

    const lowerQuery = query.toLowerCase();

    return data.filter((item: any) => {
      return fields.some((field) => {
        const value = this.getNestedValue(item, field);
        return value && String(value).toLowerCase().includes(lowerQuery);
      });
    });
  }

  /**
   * Filter by completion status
   */
  filterByCompletion<T extends { status: string }>(
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
  filterThisWeek<T extends { startDate?: string; endDate?: string }>(data: T[]): T[] {
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
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split(".").reduce((current, key) => current?.[key], obj);
  }

  /**
   * Clear all filters
   */
  clearFilters(): FilterConfig[] {
    return [];
  }
}
