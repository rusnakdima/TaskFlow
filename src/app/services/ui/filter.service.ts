/* sys lib */
import { Injectable, signal, computed } from "@angular/core";

/* models */
import { FilterField, FilterFieldOption } from "@models/filter-config.model";
import { TaskStatus } from "@models/task.model";

@Injectable({
  providedIn: "root",
})
export class FilterService {
  private _activeFilters = signal<Record<string, string | string[]>>({});
  private _searchQuery = signal<string>("");

  get activeFilters() {
    return this._activeFilters;
  }

  get searchQuery() {
    return this._searchQuery;
  }

  setSearchQuery(query: string): void {
    this._searchQuery.set(query);
  }

  setFieldFilter(fieldKey: string, value: string | string[]): void {
    this._activeFilters.update((filters) => ({
      ...filters,
      [fieldKey]: value,
    }));
  }

  clearAllFilters(): void {
    this._activeFilters.set({});
    this._searchQuery.set("");
  }

  clearFieldFilter(fieldKey: string): void {
    this._activeFilters.update((filters) => {
      const newFilters = { ...filters };
      delete newFilters[fieldKey];
      return newFilters;
    });
  }

  getFieldFilter(fieldKey: string): string | string[] | undefined {
    return this._activeFilters()[fieldKey];
  }

  applyFilters<
    T extends {
      title?: string;
      description?: string;
      status?: string;
      priority?: string;
      start_date?: string | null;
      end_date?: string | null;
    },
  >(items: T[], filters: Record<string, string | string[]>, query: string): T[] {
    let filtered = [...items];

    if (query && query.trim()) {
      const lowerQuery = query.toLowerCase().trim();
      filtered = filtered.filter(
        (item) =>
          item.title?.toLowerCase().includes(lowerQuery) ||
          (item.description && item.description.toLowerCase().includes(lowerQuery))
      );
    }

    Object.entries(filters).forEach(([fieldKey, value]) => {
      if (!value || (Array.isArray(value) && value.length === 0)) {
        return;
      }

      if (fieldKey === "status") {
        if (Array.isArray(value)) {
          filtered = filtered.filter((item) => value.includes(item.status));
        } else if (value !== "all") {
          if (value === "done") {
            filtered = filtered.filter(
              (item) =>
                item.status === TaskStatus.COMPLETED ||
                item.status === TaskStatus.SKIPPED ||
                item.status === TaskStatus.FAILED
            );
          } else {
            filtered = filtered.filter((item) => item.status === value);
          }
        }
      } else if (fieldKey === "priority") {
        if (Array.isArray(value)) {
          filtered = filtered.filter((item) => value.includes(item.priority));
        } else if (value !== "all") {
          filtered = filtered.filter((item) => item.priority === value);
        }
      } else if (fieldKey === "dateRange") {
        const range = value as { start?: string; end?: string };
        if (range.start || range.end) {
          filtered = filtered.filter((item) => {
            if (!item.start_date && !item.end_date) return false;
            const itemStart = item.start_date ? new Date(item.start_date) : null;
            const itemEnd = item.end_date ? new Date(item.end_date) : null;
            const filterStart = range.start ? new Date(range.start) : null;
            const filterEnd = range.end ? new Date(range.end) : null;

            if (filterStart && itemEnd && itemEnd < filterStart) return false;
            if (filterEnd && itemStart && itemStart > filterEnd) return false;
            return true;
          });
        }
      }
    });

    return filtered;
  }

  calculateFieldCounts<T extends { status?: string; priority?: string }>(
    items: T[],
    fieldKey: string
  ): Map<string, number> {
    const counts = new Map<string, number>();

    if (fieldKey === "status") {
      items.forEach((item) => {
        const status = item.status || "unknown";
        counts.set(status, (counts.get(status) || 0) + 1);
      });
    } else if (fieldKey === "priority") {
      items.forEach((item) => {
        const priority = item.priority || "none";
        counts.set(priority, (counts.get(priority) || 0) + 1);
      });
    }

    return counts;
  }

  buildFilterFields(type: "todos" | "tasks" | "subtasks", items?: any[]): FilterField[] {
    const fields: FilterField[] = [];

    if (type === "todos") {
      fields.push({
        key: "status",
        label: "Status",
        type: "radio",
        options: [
          { key: "all", label: "All" },
          { key: "active", label: "Active" },
          { key: "completed", label: "Completed" },
          { key: "week", label: "This Week" },
        ],
      });
      fields.push({
        key: "priority",
        label: "Priority",
        type: "radio",
        options: [
          { key: "all", label: "All" },
          { key: "low", label: "Low" },
          { key: "medium", label: "Medium" },
          { key: "high", label: "High" },
          { key: "urgent", label: "Urgent" },
        ],
      });
    } else if (type === "tasks") {
      fields.push({
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
      });
      fields.push({
        key: "priority",
        label: "Priority",
        type: "checkbox",
        options: [
          { key: "all", label: "All" },
          { key: "low", label: "Low" },
          { key: "medium", label: "Medium" },
          { key: "high", label: "High" },
        ],
      });
    } else if (type === "subtasks") {
      fields.push({
        key: "status",
        label: "Status",
        type: "checkbox",
        options: [
          { key: "pending", label: "Pending" },
          { key: "completed", label: "Completed" },
          { key: "skipped", label: "Skipped" },
        ],
      });
    }

    return fields;
  }
}
