/* sys lib */
import { CommonModule } from "@angular/common";
import {
  Component,
  EventEmitter,
  Input,
  Output,
  signal,
  ChangeDetectionStrategy,
} from "@angular/core";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";

/* components */
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

/* models */
import { TableField } from "./table-field.model";

@Component({
  selector: "app-table-view",
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, CheckboxComponent],
  templateUrl: "./table-view.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TableViewComponent {
  @Input() data: any[] = [];
  @Input() fields: TableField[] = [];
  @Input() selectedIds = new Set<string>();
  @Input() showSelection = true;
  @Input() showActionsColumn = true;
  @Input() emptyMessage = "No data available";
  @Input() actions: { key: string; icon: string; label: string }[] = [
    { key: "edit", icon: "edit", label: "Edit" },
    { key: "delete", icon: "delete", label: "Delete" },
  ];
  @Input() expandColumn = false;

  @Output() rowClick = new EventEmitter<any>();
  @Output() selectionChange = new EventEmitter<{ id: string; selected: boolean }>();
  @Output() sortChange = new EventEmitter<{ field: string; direction: "asc" | "desc" }>();
  @Output() actionClick = new EventEmitter<{ action: string; item: any }>();

  sortField = signal<string>("");
  sortDirection = signal<"asc" | "desc">("asc");

  expandedRows = signal<Set<string>>(new Set());

  toggleSort(field: TableField): void {
    if (!field.sortable) return;

    if (this.sortField() === field.key) {
      this.sortDirection.set(this.sortDirection() === "asc" ? "desc" : "asc");
    } else {
      this.sortField.set(field.key);
      this.sortDirection.set("asc");
    }

    this.sortChange.emit({
      field: field.key,
      direction: this.sortDirection(),
    });
  }

  getSortedData(): any[] {
    const field = this.sortField();
    if (!field) return this.data;

    const fieldConfig = this.fields.find((f) => f.key === field);
    const direction = this.sortDirection();

    return [...this.data].sort((a, b) => {
      const aVal = fieldConfig?.getSortValue ? fieldConfig.getSortValue(a) : a[field];
      const bVal = fieldConfig?.getSortValue ? fieldConfig.getSortValue(b) : b[field];

      if (aVal == null) return 1;
      if (bVal == null) return -1;

      let comparison = 0;
      if (typeof aVal === "string" && typeof bVal === "string") {
        comparison = aVal.localeCompare(bVal);
      } else if (typeof aVal === "number" && typeof bVal === "number") {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }

      return direction === "asc" ? comparison : -comparison;
    });
  }

  isExpanded(id: string): boolean {
    return this.expandedRows().has(id);
  }

  toggleExpanded(id: string): void {
    this.expandedRows.update((expanded) => {
      const newExpanded = new Set(expanded);
      if (newExpanded.has(id)) {
        newExpanded.delete(id);
      } else {
        newExpanded.add(id);
      }
      return newExpanded;
    });
  }

  isSelected(id: string): boolean {
    return this.selectedIds.has(id);
  }

  onSelectionChange(id: string, checked: boolean): void {
    this.selectionChange.emit({ id, selected: checked });
  }

  formatValue(item: any, field: TableField): any {
    if (field.getValue) {
      return field.getValue(item);
    }
    return item[field.key];
  }

  formatDate(value: string): string {
    if (!value) return "-";
    try {
      const date = new Date(value);
      return date.toLocaleString();
    } catch {
      return value;
    }
  }

  formatDateTime(value: string): string {
    if (!value) return "-";
    try {
      const date = new Date(value);
      return date.toLocaleString();
    } catch {
      return value;
    }
  }

  getFieldClass(field: TableField): string {
    return field.width ? `w-${field.width}` : "";
  }

  onRowClick(item: any): void {
    this.rowClick.emit(item);
  }

  onActionClick(action: string, item: any): void {
    this.actionClick.emit({ action, item });
  }

  getPriorityClass(priority: string): string {
    switch (priority?.toLowerCase()) {
      case "urgent":
        return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300";
      case "high":
        return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
      case "medium":
        return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300";
      case "low":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
      default:
        return "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
    }
  }

  getStatusClass(status: string): string {
    switch (status?.toLowerCase()) {
      case "active":
      case "in_progress":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
      case "completed":
      case "done":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
      case "pending":
        return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300";
      case "cancelled":
      case "deleted":
        return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
      default:
        return "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
    }
  }
}
