/* sys lib */

/* helpers */
import { FilterHelper } from "@helpers/filter.helper";
import { SortHelper } from "@helpers/sort.helper";

export type FilterType = "status" | "visibility";

export interface FilteredListOptions {
  filter: string;
  query: string;
  filterType: FilterType;
}

export class FilteredListHelper {
  static filterAndSort<
    T extends { title?: string; description?: string; order: number; visibility?: string },
  >(items: T[], options: FilteredListOptions): T[] {
    if (!items || !Array.isArray(items)) {
      return [];
    }
    let filtered: T[] = [...items];
    const { filter, query, filterType } = options;

    if (filterType === "visibility") {
      if (filter !== "all") {
        filtered = filtered.filter((item) => item.visibility === filter);
      }
      if (query) {
        const lowerQuery = query.toLowerCase().trim();
        filtered = filtered.filter(
          (item) =>
            item.title?.toLowerCase().includes(lowerQuery) ||
            (item.description && item.description.toLowerCase().includes(lowerQuery))
        );
      }
      return SortHelper.sortByOrder(filtered, "desc");
    }

    if (filter !== "all") {
      filtered = FilteredListHelper.applyStatusPriorityFilter(filtered, filter);
    }

    if (query) {
      const lowerQuery = query.toLowerCase().trim();
      filtered = filtered.filter(
        (item) =>
          item.title?.toLowerCase().includes(lowerQuery) ||
          (item.description && item.description.toLowerCase().includes(lowerQuery))
      );
    }

    return SortHelper.sortByOrder(filtered, "desc");
  }

  private static applyStatusPriorityFilter<T extends { order: number }>(
    items: T[],
    filter: string
  ): T[] {
    switch (filter) {
      case "active":
        return FilterHelper.filterByStatus(items as any, "pending") as unknown as T[];
      case "completed":
        return FilterHelper.filterByStatus(items as any, "completed") as unknown as T[];
      case "skipped":
        return FilterHelper.filterByStatus(items as any, "skipped") as unknown as T[];
      case "failed":
        return FilterHelper.filterByStatus(items as any, "failed") as unknown as T[];
      case "done":
        return FilterHelper.filterByStatus(items as any, "done") as unknown as T[];
      case "high":
        return FilterHelper.filterByPriority(items as any, "high") as unknown as T[];
      default:
        return items;
    }
  }
}
