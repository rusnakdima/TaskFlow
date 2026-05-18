import { Component, Input, Output, EventEmitter, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatMenuModule } from "@angular/material/menu";
import { SectionSelectAllComponent } from "@components/section-select-all/section-select-all.component";
import { ViewModeSwitcherComponent } from "@components/view-mode-switcher/view-mode-switcher.component";
import { FilterSidebarComponent } from "@components/filter-sidebar/filter-sidebar.component";
import { FilterField, FilterConfig, FilterOption } from "@models/filter-config.model";
import { PageToolbarConfig } from "@models/ui.model";

export { PageToolbarConfig } from "@models/ui.model";

@Component({
  selector: "app-page-toolbar",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    SectionSelectAllComponent,
    ViewModeSwitcherComponent,
    FilterSidebarComponent,
  ],
  templateUrl: "./page-toolbar.component.html",
})
export class PageToolbarComponent {
  @Input() config: PageToolbarConfig | null = null;
  @Input() filterFields: FilterField[] = [];
  @Input() searchQuery: string = "";
  @Input() searchFields: string[] = [];
  @Input() excludeFields: string[] = [];

  showFilter = signal(false);

  @Output() filtersChange = new EventEmitter<Record<string, string | string[] | any>>();
  @Output() searchChange = new EventEmitter<string>();

  onToggleFilter(): void {
    this.showFilter.update((v) => !v);
    this.config?.filter?.onToggle?.();
    this.filterToggle.emit();
  }

  @Output() filterToggle = new EventEmitter<void>();

  private activeFilters = signal<Record<string, string>>({});

  onFiltersChange(event: { key: string; value: string }): void {
    this.activeFilters.update((filters) => ({
      ...filters,
      [event.key]: event.value,
    }));
    this.filtersChange.emit(this.activeFilters());
  }

  onClearFilters(): void {
    this.activeFilters.set({});
    this.filtersChange.emit({});
  }

  getFilterConfigs(): FilterConfig[] {
    return this.filterFields
      .filter((field) => field.type !== "date-range")
      .map((field) => {
        let controlType: "text" | "select" | "date" = "text";
        if (field.type === "radio" || field.type === "checkbox" || field.type === "select") {
          controlType = "select";
        } else if (field.type === "date") {
          controlType = "date";
        }
        return {
          key: field.key,
          label: field.label,
          controlType,
          options:
            field.options?.map((opt) => ({
              value: opt.key,
              label: opt.label,
            })) || [],
        };
      });
  }

  getFilterValues(): Record<string, string> {
    const values: Record<string, string> = {};
    for (const field of this.filterFields) {
      const activeValue = this.activeFilters()[field.key];
      if (activeValue !== undefined) {
        values[field.key] = activeValue as string;
      } else if (field.options && field.options.length > 0) {
        const firstOption = field.options[0];
        values[field.key] = firstOption.key ?? "";
      }
    }
    return values;
  }

  getDynamicOptionsFn = (_key: string, _filter: any): FilterOption[] => {
    const field = this.filterFields.find((f) => f.key === _key);
    if (field?.options) {
      return field.options.map((opt) => ({
        value: opt.key,
        label: opt.label,
      }));
    }
    return [];
  };

  onFiltersChangeEvent(filters: Record<string, string | string[] | any>): void {
    this.filtersChange.emit(filters);
  }

  onSearchChangeEvent(query: string): void {
    this.searchChange.emit(query);
  }

  onFilterChange(_filter: string): void {
    this.config?.filter?.onToggle?.();
  }
}
