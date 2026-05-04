/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output, HostListener } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatCheckboxModule } from "@angular/material/checkbox";

/* components */
import { FilterSidebarComponent } from "@components/filter-sidebar/filter-sidebar.component";

/**
 * Filter option interface
 */
export interface FilterOption {
  key: string;
  label: string;
  icon?: string;
  count?: number;
}

@Component({
  selector: "app-filter-bar",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatCheckboxModule,
    FilterSidebarComponent,
  ],
  templateUrl: "./filter-bar.component.html",
  styleUrls: [],
})
export class FilterBarComponent {
  @Input() filterOptions: FilterOption[] = [];
  @Input() activeFilter: string = "all";
  @Input() showFilter: boolean = false;
  @Input() searchQuery: string = "";
  @Input() filterLabel: string = "";
  @Input() filterGroupName: string = "";
  @Input() showBlueprintButton: boolean = false;

  @Output() filterChange = new EventEmitter<string>();
  @Output() filterToggle = new EventEmitter<void>();
  @Output() searchChange = new EventEmitter<string>();
  @Output() openBlueprints = new EventEmitter<void>();

  @HostListener("document:keydown.escape")
  handleEscapeKey() {
    if (this.showFilter) {
      this.closeSidebar();
    }
  }

  toggleFilter() {
    this.showFilter = !this.showFilter;
    this.filterToggle.emit();
  }

  onFilterChange(filter: string) {
    this.activeFilter = filter;
    this.filterChange.emit(filter);
  }

  onSearchChange(query: string) {
    this.searchQuery = query;
    this.searchChange.emit(query);
  }

  closeSidebar() {
    this.showFilter = false;
    this.filterToggle.emit();
  }

  clearAllFilters() {
    this.activeFilter = "all";
    this.searchQuery = "";
    this.filterChange.emit("all");
  }

  clearSearch() {
    this.searchQuery = "";
    this.searchChange.emit("");
    this.filterChange.emit(this.activeFilter);
  }

  onOpenBlueprints() {
    this.openBlueprints.emit();
  }
}
