/* sys lib */
import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from "@angular/material/button";
import { MatChipsModule } from "@angular/material/chips";
import { MatMenuModule } from "@angular/material/menu";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatInputModule } from "@angular/material/input";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatSelectModule } from "@angular/material/select";
import { MatDatepickerModule } from "@angular/material/datepicker";
import { MatNativeDateModule } from "@angular/material/core";

/* models */
import { ResponseStatus } from "@models/response";
import { TaskStatus } from "@models/task";

/* services */
import { AdminService } from "@services/admin.service";
import { NotifyService } from "@services/notify.service";

interface AdminData {
  [key: string]: any[];
}

@Component({
  selector: "app-admin-view",
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatCardModule,
    MatButtonModule,
    MatChipsModule,
    MatMenuModule,
    MatCheckboxModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    FormsModule,
  ],
  templateUrl: "./admin.view.html",
})
export class AdminView implements OnInit {
  constructor(
    private adminService: AdminService,
    private notifyService: NotifyService
  ) {}

  adminData: AdminData = {};
  selectedType: string = "todos";
  loading: boolean = false;
  showMobileSidebar: boolean = false;
  selectedRecords: Set<string> = new Set();
  titleFilter: string = "";
  descriptionFilter: string = "";
  priorityFilter: string = "";
  startDateFilter: string = "";
  endDateFilter: string = "";
  showFilters: boolean = false;
  statusFilter: string = "all";
  isCompletedFilter: string = "all";
  userFilter: string = "";
  categoriesFilter: string = "";
  todoIdFilter: string = "";
  taskIdFilter: string = "";

  dataTypes = [
    {
      id: "todos",
      label: "Todos",
      icon: "list_alt",
      count: 0,
    },
    {
      id: "tasks",
      label: "Tasks",
      icon: "checklist",
      count: 0,
    },
    {
      id: "subtasks",
      label: "Subtasks",
      icon: "assignment",
      count: 0,
    },
    {
      id: "categories",
      label: "Categories",
      icon: "category",
      count: 0,
    },
    {
      id: "daily_activities",
      label: "Daily Activities",
      icon: "schedule",
      count: 0,
    },
  ];

  ngOnInit(): void {
    this.loadAdminData();
  }

  async loadAdminData() {
    this.loading = true;
    try {
      const response = await this.adminService.getAllDataForAdmin<AdminData>();
      if (response.status === ResponseStatus.SUCCESS) {
        this.adminData = response.data;

        this.dataTypes.forEach((type) => {
          const data = this.adminData[type.id];
          type.count = data ? data.length : 0;
        });
      } else {
        this.notifyService.showError(response.message || "Failed to load admin data");
      }
    } catch (error) {
      this.notifyService.showError("Failed to load admin data: " + error);
    } finally {
      this.loading = false;
    }
  }

  selectDataType(typeId: string) {
    this.selectedType = typeId;
    this.clearSelection();
    this.clearFilters();
    this.showMobileSidebar = false;
  }

  getCurrentData(): any[] {
    let data = this.adminData[this.selectedType] || [];

    if (this.titleFilter) {
      data = data.filter(
        (item) => item.title && item.title.toLowerCase().includes(this.titleFilter.toLowerCase())
      );
    }

    if (this.descriptionFilter) {
      data = data.filter(
        (item) =>
          item.description &&
          item.description.toLowerCase().includes(this.descriptionFilter.toLowerCase())
      );
    }

    if (this.priorityFilter && this.priorityFilter !== "") {
      data = data.filter((item) => item.priority === this.priorityFilter);
    }

    if (this.statusFilter === "active") {
      data = data.filter((item) => !item.isDeleted);
    } else if (this.statusFilter === "deleted") {
      data = data.filter((item) => item.isDeleted);
    }

    if (this.selectedType === "tasks" && this.isCompletedFilter === "completed") {
      data = data.filter((item) => item.status === TaskStatus.COMPLETED);
    } else if (this.selectedType === "tasks" && this.isCompletedFilter === "pending") {
      data = data.filter((item) => item.status === TaskStatus.PENDING);
    } else if (this.selectedType === "tasks" && this.isCompletedFilter === "skipped") {
      data = data.filter((item) => item.status === TaskStatus.SKIPPED);
    } else if (this.selectedType === "tasks" && this.isCompletedFilter === "failed") {
      data = data.filter((item) => item.status === TaskStatus.FAILED);
    } else if (this.selectedType === "tasks" && this.isCompletedFilter === "done") {
      data = data.filter(
        (item) => item.status === TaskStatus.COMPLETED || item.status === TaskStatus.SKIPPED
      );
    }

    if (this.selectedType === "subtasks" && this.isCompletedFilter === "completed") {
      data = data.filter((item) => item.status === TaskStatus.COMPLETED);
    } else if (this.selectedType === "subtasks" && this.isCompletedFilter === "pending") {
      data = data.filter((item) => item.status === TaskStatus.PENDING);
    } else if (this.selectedType === "subtasks" && this.isCompletedFilter === "skipped") {
      data = data.filter((item) => item.status === TaskStatus.SKIPPED);
    } else if (this.selectedType === "subtasks" && this.isCompletedFilter === "failed") {
      data = data.filter((item) => item.status === TaskStatus.FAILED);
    } else if (this.selectedType === "subtasks" && this.isCompletedFilter === "done") {
      data = data.filter(
        (item) => item.status === TaskStatus.COMPLETED || item.status === TaskStatus.SKIPPED
      );
    }

    if (this.userFilter) {
      const filter = this.userFilter.toLowerCase();
      data = data.filter((item) => {
        if ((this.selectedType === "todos" || this.selectedType === "categories") && item.user) {
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

    if (this.categoriesFilter && this.selectedType === "todos") {
      const filter = this.categoriesFilter.toLowerCase();
      data = data.filter((item) => {
        if (item.categories && Array.isArray(item.categories)) {
          return item.categories.some((cat: any) => cat.title?.toLowerCase().includes(filter));
        }
        return false;
      });
    }

    if (this.startDateFilter) {
      const filterDate = new Date(this.startDateFilter);
      data = data.filter((item) => {
        const itemDate = new Date(item.startDate || item.createdAt);
        return itemDate >= filterDate;
      });
    }

    if (this.endDateFilter) {
      const filterDate = new Date(this.endDateFilter);
      data = data.filter((item) => {
        const itemDate = new Date(item.endDate || item.createdAt);
        return itemDate <= filterDate;
      });
    }

    if (this.todoIdFilter && this.selectedType === "tasks") {
      const filter = this.todoIdFilter.toLowerCase();
      data = data.filter((item) => {
        return item.todoId && item.todoId.toLowerCase().includes(filter);
      });
    }

    if (this.taskIdFilter && this.selectedType === "subtasks") {
      const filter = this.taskIdFilter.toLowerCase();
      data = data.filter((item) => {
        return item.taskId && item.taskId.toLowerCase().includes(filter);
      });
    }

    return data;
  }

  getDataProperties(item: any): { key: string; value: any }[] {
    return Object.keys(item).map((key) => ({
      key,
      value: item[key],
    }));
  }

  getSelectedTypeLabel(): string {
    const type = this.dataTypes.find((t) => t.id === this.selectedType);
    return type ? type.label : this.selectedType;
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      return date.toLocaleString();
    } catch {
      return dateStr;
    }
  }

  toggleMobileSidebar() {
    this.showMobileSidebar = !this.showMobileSidebar;
  }

  closeMobileSidebar() {
    this.showMobileSidebar = false;
  }

  closeFilters() {
    this.showFilters = false;
  }

  async deleteRecord(record: any) {
    if (confirm(`Are you sure you want to delete this ${this.selectedType.slice(0, -1)} record?`)) {
      try {
        const response = await this.adminService.permanentlyDeleteRecord(
          this.selectedType,
          record.id
        );

        if (response.status === ResponseStatus.SUCCESS) {
          this.notifyService.showSuccess("Record permanently deleted");

          await this.loadAdminData();
        } else {
          this.notifyService.showError(response.message || "Failed to delete record");
        }
      } catch (error) {
        this.notifyService.showError("Error deleting record: " + error);
      }
    }
  }

  toggleSelect(id: string): void {
    if (this.selectedRecords.has(id)) {
      this.selectedRecords.delete(id);
    } else {
      this.selectedRecords.add(id);
    }
  }

  isSelected(id: string): boolean {
    return this.selectedRecords.has(id);
  }

  clearSelection(): void {
    this.selectedRecords.clear();
  }

  clearFilters(): void {
    this.titleFilter = "";
    this.descriptionFilter = "";
    this.priorityFilter = "";
    this.startDateFilter = "";
    this.endDateFilter = "";
    this.statusFilter = "all";
    this.isCompletedFilter = "all";
    this.userFilter = "";
    this.categoriesFilter = "";
    this.todoIdFilter = "";
    this.taskIdFilter = "";
  }

  async deleteSelected(): Promise<void> {
    const count = this.selectedRecords.size;
    if (count === 0) return;

    const plural = count > 1 ? "records" : "record";
    const typeSingular = this.selectedType.slice(0, -1).toLowerCase();
    if (
      !confirm(
        `Are you sure you want to permanently delete ${count} ${typeSingular} ${plural}? This cannot be undone.`
      )
    )
      return;

    let successCount = 0;
    for (const id of this.selectedRecords) {
      try {
        const response = await this.adminService.permanentlyDeleteRecord(this.selectedType, id);
        if (response.status === ResponseStatus.SUCCESS) {
          successCount++;
        }
      } catch (error) {
        console.error(`Error deleting record ${id}:`, error);
      }
    }

    this.clearSelection();
    if (successCount > 0) {
      this.notifyService.showSuccess(
        `${successCount} ${successCount === 1 ? "record" : "records"} permanently deleted`
      );
      await this.loadAdminData();
    }

    if (successCount < count) {
      this.notifyService.showError(
        `Failed to delete ${count - successCount} ${count - successCount === 1 ? "record" : "records"}`
      );
    }
  }
}
