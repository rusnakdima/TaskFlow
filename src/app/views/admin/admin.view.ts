/* sys lib */
import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from "@angular/material/button";
import { MatChipsModule } from "@angular/material/chips";
import { MatMenuModule } from "@angular/material/menu";

/* models */
import { Response, ResponseStatus } from "@models/response";

/* services */
import { AdminService } from "@services/admin.service";
import { NotifyService } from "@services/notify.service";

interface AdminData {
  [key: string]: any[];
}

export type FilterType = "all" | "deleted";

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
  currentFilter: FilterType = "all";

  dataTypes = [
    { id: "todos", label: "Todos", icon: "list_alt", count: 0 },
    { id: "tasks", label: "Tasks", icon: "checklist", count: 0 },
    { id: "subtasks", label: "Subtasks", icon: "assignment", count: 0 },
    { id: "categories", label: "Categories", icon: "category", count: 0 },
    { id: "daily_activities", label: "Daily Activities", icon: "schedule", count: 0 },
  ];

  filterOptions = [
    { value: "all" as FilterType, label: "All Records", icon: "list" },
    { value: "deleted" as FilterType, label: "Deleted Only", icon: "delete_forever" },
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

        // Update counts
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
    this.showMobileSidebar = false; // Close mobile sidebar when selecting
  }

  setFilter(filterType: FilterType) {
    this.currentFilter = filterType;
  }

  getCurrentData(): any[] {
    let data = this.adminData[this.selectedType] || [];

    if (this.currentFilter === "deleted") {
      data = data.filter((item) => item.isDeleted);
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

  getCurrentFilterLabel(): string {
    const filter = this.filterOptions.find((f) => f.value === this.currentFilter);
    return filter ? filter.label : "All Records";
  }

  getCurrentFilterIcon(): string {
    const filter = this.filterOptions.find((f) => f.value === this.currentFilter);
    return filter ? filter.icon : "list";
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
}
