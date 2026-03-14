/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output, HostListener } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
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
  imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule, MatCheckboxModule],
  templateUrl: "./filter-bar.component.html",
  styles: [
    `
      .filter-sidebar-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 999;
        animation: fadeIn 0.2s ease-out;
      }

      .filter-sidebar {
        position: fixed;
        top: 0;
        right: -320px;
        width: 320px;
        max-width: 85vw;
        height: 100vh;
        background: white;
        z-index: 1000;
        box-shadow: -4px 0 24px rgba(0, 0, 0, 0.15);
        transition: right 0.3s ease-in-out;
        overflow-y: auto;
      }

      :host-context(.dark) .filter-sidebar {
        background: rgb(39 39 42);
      }

      .filter-sidebar.open {
        right: 0;
      }

      .filter-sidebar-content {
        display: flex;
        flex-direction: column;
        height: 100%;
        padding: 1.5rem;
      }

      .filter-sidebar-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-bottom: 1rem;
        border-bottom: 1px solid rgb(229 231 235);
        margin-bottom: 1.5rem;
      }

      :host-context(.dark) .filter-sidebar-header {
        border-bottom-color: rgb(64 64 64);
      }

      .filter-sidebar-section {
        margin-bottom: 1.5rem;
      }

      .filter-sidebar-actions {
        margin-top: auto;
        padding-top: 1rem;
        border-top: 1px solid rgb(229 231 235);
      }

      :host-context(.dark) .filter-sidebar-actions {
        border-top-color: rgb(64 64 64);
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      @media (max-width: 640px) {
        .filter-sidebar {
          width: 100%;
          max-width: 100%;
        }
      }
    `,
  ],
})
export class FilterBarComponent {
  @Input() filterOptions: FilterOption[] = [];
  @Input() activeFilter: string = "all";
  @Input() showFilter: boolean = false;
  @Input() showSelectAll: boolean = false;
  @Input() isAllSelected: boolean = false;
  @Input() selectedCount: number = 0;
  @Input() searchQuery: string = "";
  @Input() filterLabel: string = "";
  @Input() filterGroupName: string = "";

  @Output() filterChange = new EventEmitter<string>();
  @Output() filterToggle = new EventEmitter<void>();
  @Output() selectAll = new EventEmitter<void>();
  @Output() clearSelection = new EventEmitter<void>();
  @Output() searchChange = new EventEmitter<string>();

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

  onSearchInputChange(query: string) {
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
    // Also trigger filter change to re-apply with cleared filters
    this.filterChange.emit("all");
  }

  clearSearch() {
    this.searchQuery = "";
    this.searchChange.emit("");
    // Trigger a re-filter with empty search
    this.filterChange.emit(this.activeFilter);
  }

  onSelectAll() {
    this.selectAll.emit();
  }

  onClearSelection() {
    this.clearSelection.emit();
  }
}
