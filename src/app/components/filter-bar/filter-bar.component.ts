/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatChipsModule } from "@angular/material/chips";
import { MatMenuModule } from "@angular/material/menu";
import { MatSelectModule } from "@angular/material/select";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatCheckboxModule } from "@angular/material/checkbox";

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
    MatChipsModule,
    MatMenuModule,
    MatSelectModule,
    MatFormFieldModule,
    MatCheckboxModule,
  ],
  templateUrl: "./filter-bar.component.html",
})
export class FilterBarComponent {
  @Input() filterOptions: FilterOption[] = [];
  @Input() activeFilter: string = "all";
  @Input() showFilter: boolean = false;
  @Input() showSelectAll: boolean = false;
  @Input() isAllSelected: boolean = false;
  @Input() selectedCount: number = 0;

  @Output() filterChange = new EventEmitter<string>();
  @Output() filterToggle = new EventEmitter<void>();
  @Output() selectAll = new EventEmitter<void>();
  @Output() clearSelection = new EventEmitter<void>();

  toggleFilter() {
    this.showFilter = !this.showFilter;
    this.filterToggle.emit();
  }

  onFilterChange(filter: string) {
    this.activeFilter = filter;
    this.filterChange.emit(filter);
  }

  onSelectAll() {
    this.selectAll.emit();
  }

  onClearSelection() {
    this.clearSelection.emit();
  }
}
