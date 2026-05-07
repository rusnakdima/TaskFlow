import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatSelectModule } from "@angular/material/select";
import { FormsModule } from "@angular/forms";
import { FilterConfig, FilterOption } from "@models/filter-config.model";

@Component({
  selector: "app-filter-sidebar",
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    FormsModule,
  ],
  templateUrl: "./filter-sidebar.component.html",
  styleUrls: ["./filter-sidebar.component.scss"],
})
export class FilterSidebarComponent {
  @Input() isOpen = false;
  @Input() title = "Filters";
  @Input() filters: FilterConfig[] = [];
  @Input() filterValues: Record<string, string> = {};
  @Input() getOptionsFn: (key: string, filter: FilterConfig) => FilterOption[] = () => [];

  @Output() closeEvent = new EventEmitter<void>();
  @Output() clearEvent = new EventEmitter<void>();
  @Output() applyEvent = new EventEmitter<void>();
  @Output() filterChangeEvent = new EventEmitter<{ key: string; value: string }>();

  compareFn = (a: string, b: string): boolean => a === b;

  get hasActiveFilters(): boolean {
    return Object.values(this.filterValues).some((v) => v && v !== "");
  }

  getFilterValue(key: string): string {
    return this.filterValues[key] || "";
  }

  getFilterOptions(filter: FilterConfig): FilterOption[] {
    if (filter.options && filter.options.length > 0) {
      return filter.options;
    }
    return this.getOptionsFn(filter.key, filter);
  }

  onFilterChange(key: string, value: string): void {
    this.filterChangeEvent.emit({ key, value });
  }

  close(): void {
    this.closeEvent.emit();
  }

  clearAll(): void {
    this.clearEvent.emit();
  }

  apply(): void {
    this.applyEvent.emit();
  }
}
