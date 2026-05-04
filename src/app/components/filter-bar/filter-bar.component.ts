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
  template: `
    <app-filter-sidebar
      [isOpen]="showFilter"
      title="Filters"
      (closeEvent)="closeSidebar()"
      (clearEvent)="clearAllFilters()"
      (applyEvent)="closeSidebar()"
    >
      <div filter-header class="filter-sidebar-header">
        <h3 class="textNormal flex items-center gap-2 text-lg font-semibold">
          <mat-icon class="h-5! w-5! min-w-5 text-xl! text-blue-600 dark:text-blue-400"
            >filter_list</mat-icon
          >
          Filters
        </h3>
        <button
          mat-icon-button
          (click)="toggleFilter()"
          class="textMuted hover:textNormal"
          aria-label="Close filters"
        >
          <mat-icon class="h-5! w-5! min-w-5 text-xl!">close</mat-icon>
        </button>
      </div>

      <div class="filter-sidebar-section">
        <label class="textMuted mb-2 block text-xs font-medium tracking-wide uppercase">
          Search
        </label>
        <div class="relative">
          <mat-icon
            class="textMuted absolute top-1/2 left-3 h-4! w-4! min-w-4 -translate-y-1/2 text-base!"
            >search</mat-icon
          >
          <input
            type="text"
            [ngModel]="searchQuery"
            (ngModelChange)="onSearchChange($event)"
            placeholder="Search..."
            class="textNormal placeholder:textMuted w-full rounded-lg border border-gray-300 bg-white py-2 pr-4 pl-10 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-700"
          />
        </div>
        @if (searchQuery) {
          <button mat-button color="warn" (click)="clearSearch()" class="mt-2 text-xs">
            <mat-icon class="mr-1 h-3! w-3! min-w-3 text-xs!">close</mat-icon>
            Clear Search
          </button>
        }
      </div>

      <div class="filter-sidebar-section">
        <label class="textMuted mb-2 block text-xs font-medium tracking-wide uppercase">
          {{ filterLabel || "Filter by" }}
        </label>
        <div class="flex flex-col gap-1">
          @for (option of filterOptions; track option.key) {
            <label
              class="flex cursor-pointer items-center gap-3 rounded-lg p-3 transition-colors"
              [class.bg-blue-50]="activeFilter === option.key"
              [class.dark:bg-blue-900/20]="activeFilter === option.key"
              [class.hover:bg-gray-50]="activeFilter !== option.key"
              [class.dark:hover:bg-zinc-700]="activeFilter !== option.key"
            >
              <input
                type="radio"
                [name]="filterGroupName || 'filter'"
                [value]="option.key"
                [checked]="activeFilter === option.key"
                (change)="onFilterChange(option.key)"
                class="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div class="flex flex-1 items-center justify-between">
                <div class="flex items-center gap-2">
                  @if (option.icon) {
                    <mat-icon class="textMuted h-4! w-4! min-w-4 text-base!">{{
                      option.icon
                    }}</mat-icon>
                  }
                  <span class="textNormal text-sm font-medium">{{ option.label }}</span>
                </div>
                @if (option.count !== undefined) {
                  <span
                    class="textNormal rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium dark:bg-zinc-600"
                  >
                    {{ option.count }}
                  </span>
                }
              </div>
            </label>
          }
        </div>
      </div>

      <div filter-actions class="filter-sidebar-actions">
        <button mat-button color="primary" (click)="closeSidebar()" class="w-full">Done</button>
        @if (activeFilter !== "all" || searchQuery) {
          <button mat-button color="warn" (click)="clearAllFilters()" class="mt-2 w-full">
            <mat-icon class="mr-1 h-4! w-4! min-w-4 text-base!">clear_all</mat-icon>
            Clear All Filters
          </button>
        }
      </div>
    </app-filter-sidebar>
  `,
  styles: [
    `
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
    `,
  ],
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
