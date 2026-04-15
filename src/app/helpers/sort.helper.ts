/* sys lib */

/* helpers */
import { ObjectHelper } from "@helpers/object.helper";

/**
 * Sort configuration interface
 */
export interface SortConfig {
  field: string;
  order: "asc" | "desc";
}

/**
 * SortHelper - Centralized sorting logic for all views
 *
 * Provides reusable sorting methods for arrays of data
 */
export class SortHelper {
  /**
   * Sort array by field
   */
  static sortByField<T>(data: T[], config: SortConfig): T[] {
    const { field, order } = config;

    return [...data].sort((a: any, b: any) => {
      let aValue = ObjectHelper.getNestedValue(a, field);
      let bValue = ObjectHelper.getNestedValue(b, field);

      // Handle date fields
      if (SortHelper.isDateField(field)) {
        aValue = aValue ? new Date(aValue).getTime() : 0;
        bValue = bValue ? new Date(bValue).getTime() : 0;
      }

      // Handle null/undefined
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return order === "asc" ? -1 : 1;
      if (bValue == null) return order === "asc" ? 1 : -1;

      // Handle string comparison
      if (typeof aValue === "string") {
        aValue = aValue.toLowerCase();
        bValue = typeof bValue === "string" ? bValue.toLowerCase() : bValue;
      }

      // Compare values
      if (aValue < bValue) return order === "asc" ? -1 : 1;
      if (aValue > bValue) return order === "asc" ? 1 : -1;
      return 0;
    });
  }

  /**
   * Sort by order field (for drag-drop reordering)
   */
  static sortByOrder<T extends { order: number }>(data: T[], order: "asc" | "desc" = "desc"): T[] {
    return [...data].sort((a, b) => {
      return order === "asc" ? a.order - b.order : b.order - a.order;
    });
  }

  /**
   * Sort by status with custom order
   */
  static sortByStatus<T extends { status: string }>(data: T[], order: "asc" | "desc" = "asc"): T[] {
    const statusOrder = {
      pending: 0,
      completed: 1,
      skipped: 2,
      failed: 3,
    };

    return [...data].sort((a, b) => {
      const aOrder = statusOrder[a.status as keyof typeof statusOrder] ?? 0;
      const bOrder = statusOrder[b.status as keyof typeof statusOrder] ?? 0;
      return order === "asc" ? aOrder - bOrder : bOrder - aOrder;
    });
  }

  /**
   * Sort by priority with custom order
   */
  static sortByPriority<T extends { priority: string }>(
    data: T[],
    order: "asc" | "desc" = "asc"
  ): T[] {
    const priorityOrder = {
      low: 0,
      medium: 1,
      high: 2,
    };

    return [...data].sort((a, b) => {
      const aOrder = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 0;
      const bOrder = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 0;
      return order === "asc" ? aOrder - bOrder : bOrder - aOrder;
    });
  }

  /**
   * Check if field is a date field
   */
  private static isDateField(field: string): boolean {
    const dateFields = ["created_at", "updated_at", "startDate", "endDate"];
    return dateFields.includes(field);
  }
}
