import { Injectable } from "@angular/core";
import { FilterService, FilterConfig } from "@services/filter.service";
import { SortService } from "@services/sort.service";
import { TaskStatus } from "@models/task.model";

export interface AdminFilterState {
  titleFilter: string;
  descriptionFilter: string;
  priorityFilter: string;
  startDateFilter: string;
  endDateFilter: string;
  statusFilter: string;
  isCompletedFilter: string;
  userFilter: string;
  categoriesFilter: string;
  todoIdFilter: string;
  taskIdFilter: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
}

@Injectable({
  providedIn: "root",
})
export class AdminFiltersService {
  constructor(
    private filterService: FilterService,
    private sortService: SortService
  ) {}

  buildFilterConfigs(filters: AdminFilterState, selectedType: string): FilterConfig[] {
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
      filterConfigs.push({ field: "isDeleted", value: false, operator: "equals" });
    } else if (filters.statusFilter === "deleted") {
      filterConfigs.push({ field: "isDeleted", value: true, operator: "equals" });
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

  applyFilters(
    data: any[],
    filters: AdminFilterState,
    selectedType: string
  ): any[] {
    // Build filter configs using FilterService
    const filterConfigs = this.buildFilterConfigs(filters, selectedType);

    // Apply filters using FilterService
    data = this.filterService.applyFilters(data, filterConfigs);

    // Custom filters (user, categories, dates, IDs)
    data = this.applyCustomFilters(data, filters, selectedType);

    // Sort using SortService
    data = this.sortService.sortByField(data, {
      field: filters.sortBy,
      order: filters.sortOrder,
    });

    return data;
  }

  private applyCustomFilters(
    data: any[],
    filters: AdminFilterState,
    selectedType: string
  ): any[] {
    if (filters.userFilter) {
      const filter = filters.userFilter.toLowerCase();
      data = data.filter((item) => {
        if (
          (selectedType === "todos" || selectedType === "categories") &&
          item.user
        ) {
          const { profile, username } = item.user;
          const firstName = profile?.name?.toLowerCase() || "";
          const lastName = profile?.lastName?.toLowerCase() || "";
          const userName = username?.toLowerCase() || "";
          return (
            firstName.includes(filter) ||
            lastName.includes(filter) ||
            userName.includes(filter)
          );
        }
        return false;
      });
    }

    if (filters.categoriesFilter && selectedType === "todos") {
      const filter = filters.categoriesFilter.toLowerCase();
      data = data.filter((item) => {
        if (item.categories && Array.isArray(item.categories)) {
          return item.categories.some((cat: any) =>
            cat.title?.toLowerCase().includes(filter)
          );
        }
        return false;
      });
    }

    if (filters.startDateFilter) {
      const filterDate = new Date(filters.startDateFilter);
      data = data.filter((item) => {
        const itemDate = new Date(item.startDate || item.createdAt);
        return itemDate >= filterDate;
      });
    }

    if (filters.endDateFilter) {
      const filterDate = new Date(filters.endDateFilter);
      data = data.filter((item) => {
        const itemDate = new Date(item.endDate || item.createdAt);
        return itemDate <= filterDate;
      });
    }

    if (filters.todoIdFilter && selectedType === "tasks") {
      const filter = filters.todoIdFilter.toLowerCase();
      data = data.filter((item) => {
        return item.todoId && item.todoId.toLowerCase().includes(filter);
      });
    }

    if (filters.taskIdFilter && selectedType === "subtasks") {
      const filter = filters.taskIdFilter.toLowerCase();
      data = data.filter((item) => {
        return item.taskId && item.taskId.toLowerCase().includes(filter);
      });
    }

    return data;
  }

  clearFilters(): AdminFilterState {
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
      sortBy: "createdAt",
      sortOrder: "desc",
    };
  }

  filterByStatus(
    data: any[],
    statusFilter: string,
    selectedType: string
  ): any[] {
    if (statusFilter === "done") {
      return data.filter((item) =>
        [TaskStatus.COMPLETED, TaskStatus.SKIPPED].includes(item.status)
      );
    } else if (statusFilter !== "all") {
      const filterConfigs: FilterConfig[] = [
        {
          field: "status",
          value:
            TaskStatus[statusFilter.toUpperCase() as keyof typeof TaskStatus],
          operator: "equals",
        },
      ];
      return this.filterService.applyFilters(data, filterConfigs);
    }
    return data;
  }
}
