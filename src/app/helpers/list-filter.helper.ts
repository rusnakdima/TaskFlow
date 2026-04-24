export type SortDirection = 'asc' | 'desc';
export type FilterOperator = 'eq' | 'ne' | 'gt' | 'lt' | 'contains' | 'startsWith';

export interface FilterConfig {
  field: string;
  operator: FilterOperator;
  value: any;
}

export interface SortConfig {
  field: string;
  direction: SortDirection;
}

export interface ListState {
  searchQuery: string;
  filters: FilterConfig[];
  sort: SortConfig | null;
  page: number;
  pageSize: number;
}

export class ListFilterHelper {
  static defaultState(pageSize: number = 20): ListState {
    return {
      searchQuery: '',
      filters: [],
      sort: null,
      page: 1,
      pageSize,
    };
  }

  static filterBySearch<T>(items: T[], query: string, fields: (keyof T)[]): T[] {
    if (!query.trim()) return items;
    const lowerQuery = query.toLowerCase();
    return items.filter((item) =>
      fields.some((field) => {
        const value = item[field];
        if (value == null) return false;
        return String(value).toLowerCase().includes(lowerQuery);
      })
    );
  }

  static filterByConfig<T>(items: T[], filters: FilterConfig[]): T[] {
    if (!filters.length) return items;
    return items.filter((item) =>
      filters.every((filter) => this.applyFilter(item, filter))
    );
  }

  private static applyFilter<T>(item: T, filter: FilterConfig): boolean {
    const value = (item as any)[filter.field];
    switch (filter.operator) {
      case 'eq':
        return value === filter.value;
      case 'ne':
        return value !== filter.value;
      case 'gt':
        return value > filter.value;
      case 'lt':
        return value < filter.value;
      case 'contains':
        return String(value).toLowerCase().includes(String(filter.value).toLowerCase());
      case 'startsWith':
        return String(value).toLowerCase().startsWith(String(filter.value).toLowerCase());
      default:
        return true;
    }
  }

  static sortByConfig<T>(items: T[], sort: SortConfig | null): T[] {
    if (!sort) return items;
    return [...items].sort((a, b) => {
      const aVal = (a as any)[sort.field];
      const bVal = (b as any)[sort.field];
      let comparison = 0;
      if (aVal < bVal) comparison = -1;
      else if (aVal > bVal) comparison = 1;
      return sort.direction === 'desc' ? -comparison : comparison;
    });
  }

  static paginate<T>(items: T[], page: number, pageSize: number): {
    items: T[];
    totalPages: number;
    totalCount: number;
  } {
    const totalCount = items.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    const startIndex = (page - 1) * pageSize;
    const paginatedItems = items.slice(startIndex, startIndex + pageSize);
    return {
      items: paginatedItems,
      totalPages,
      totalCount,
    };
  }

  static buildFilter(field: string, operator: FilterOperator, value: any): FilterConfig {
    return { field, operator, value };
  }

  static buildSort(field: string, direction: SortDirection = 'asc'): SortConfig {
    return { field, direction };
  }

  static toggleSort(sort: SortConfig | null, field: string): SortConfig | null {
    if (!sort || sort.field !== field) {
      return { field, direction: 'asc' };
    }
    if (sort.direction === 'asc') {
      return { field, direction: 'desc' };
    }
    return null;
  }
}