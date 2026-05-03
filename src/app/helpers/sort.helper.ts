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
    if (!Array.isArray(data)) {
      return [];
    }
    const { field, order } = config;

    return [...data].sort((a: T, b: T) => {
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
    if (!Array.isArray(data)) {
      return [];
    }
    return [...data].sort((a, b) => {
      return order === "asc" ? a.order - b.order : b.order - a.order;
    });
  }

  /**
   * Check if field is a date field
   */
  private static isDateField(field: string): boolean {
    const dateFields = ["createdAt", "updatedAt", "startDate", "endDate"];
    return dateFields.includes(field);
  }
}
