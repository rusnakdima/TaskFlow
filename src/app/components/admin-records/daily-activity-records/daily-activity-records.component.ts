/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output, signal } from "@angular/core";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatChipsModule } from "@angular/material/chips";
import { MatCardModule } from "@angular/material/card";

@Component({
  selector: "app-daily-activity-records",
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatChipsModule, MatCardModule],
  templateUrl: "./daily-activity-records.component.html",
})
export class DailyActivityRecordsComponent {
  @Input() records: any[] = [];
  @Input() selectedRecords = new Set<string>();
  @Output() selectRecord = new EventEmitter<string>();
  @Output() deleteRecord = new EventEmitter<any>();
  @Output() toggleDelete = new EventEmitter<any>();

  expandedRecords = signal<Set<string>>(new Set());

  toggleExpanded(recordId: string): void {
    this.expandedRecords.update((expanded) => {
      const newExpanded = new Set(expanded);
      if (newExpanded.has(recordId)) {
        newExpanded.delete(recordId);
      } else {
        newExpanded.add(recordId);
      }
      return newExpanded;
    });
  }

  isExpanded(recordId: string): boolean {
    return this.expandedRecords().has(recordId);
  }

  isSelected(recordId: string): boolean {
    return this.selectedRecords.has(recordId);
  }

  onSelectChange(recordId: string): void {
    this.selectRecord.emit(recordId);
  }

  onDeleteRecord(record: any): void {
    this.deleteRecord.emit(record);
  }

  onToggleDelete(record: any): void {
    this.toggleDelete.emit(record);
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

  getDataProperties(item: any): { key: string; value: any }[] {
    return Object.keys(item).map((key) => ({
      key,
      value: item[key],
    }));
  }

  getStatusColor(isDeleted: boolean): string {
    return isDeleted
      ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
      : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
  }

  getStatusText(isDeleted: boolean): string {
    return isDeleted ? "Deleted" : "Active";
  }

  isArray(value: any): boolean {
    return Array.isArray(value);
  }
}
