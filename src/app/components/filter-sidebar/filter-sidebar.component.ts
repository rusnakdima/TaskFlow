import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatSelectModule } from "@angular/material/select";
import { FilterConfig, FilterOption } from "@models/filter-config.model";
import { AppButtonComponent } from "@components/shared/button/button.component";

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
    AppButtonComponent,
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

  getFilteredOptions(filter: FilterConfig): FilterOption[] {
    const query = this.getSearchQuery(filter.key).toLowerCase().trim();
    const options = this.getFilterOptions(filter);
    if (!query) {
      return options;
    }
    return options.filter((opt) => opt.label.toLowerCase().includes(query));
  }

  private searchQueries = signal<Record<string, string>>({});

  getSearchQuery(key: string): string {
    return this.searchQueries()[key] || "";
  }

  onSearchQueryChange(key: string, query: string): void {
    this.searchQueries.update((current) => ({
      ...current,
      [key]: query,
    }));
  }

  onFilterChange(key: string, value: string): void {
    this.filterChangeEvent.emit({ key, value });
    this.onSearchQueryChange(key, "");
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
