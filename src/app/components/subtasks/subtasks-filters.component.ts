import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";

import { FilterBarComponent } from "@components/filter-bar/filter-bar.component";

@Component({
  selector: "app-subtasks-filters",
  standalone: true,
  imports: [CommonModule, FilterBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./subtasks-filters.component.html",
})
export class SubtasksFiltersComponent {
  @Input() activeFilter = "all";
  @Input() showFilter = false;
  @Input() searchQuery = "";

  @Output() filterToggle = new EventEmitter<void>();
  @Output() filterChange = new EventEmitter<string>();
  @Output() searchChange = new EventEmitter<string>();

  filterOptions = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "completed", label: "Completed" },
    { key: "skipped", label: "Skipped" },
    { key: "failed", label: "Failed" },
    { key: "done", label: "Done" },
    { key: "high", label: "High Priority" },
  ];

  onFilterToggle(): void {
    this.filterToggle.emit();
  }

  onFilterChange(filter: string): void {
    this.filterChange.emit(filter);
  }

  onSearchChange(query: string): void {
    this.searchChange.emit(query);
  }
}
