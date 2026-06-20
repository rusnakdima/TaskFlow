import { Component, Input, Output, EventEmitter, signal, OnInit, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatMenuModule } from "@angular/material/menu";
import { SectionSelectAllComponent } from "@components/section-select-all/section-select-all.component";
import {
  SegmentSelectorComponent,
  SegmentOption,
} from "@components/segment-selector/segment-selector.component";
import { FilterSidebarComponent } from "@components/filter-sidebar/filter-sidebar.component";
import { AppButtonComponent } from "@components/shared/button/button.component";
import { FilterField, FilterConfig, FilterOption } from "@entities/filter-config.model";
import { PageToolbarConfig } from "@entities/ui.model";
import { ViewMode } from "@entities/view-mode.model";
export { PageToolbarConfig } from "@entities/ui.model";
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
    SegmentSelectorComponent,
    FilterSidebarComponent,
    AppButtonComponent,
  ],
  templateUrl: "./page-toolbar.component.html",
})
export class PageToolbarComponent implements OnInit, OnDestroy {
  @Input() config: PageToolbarConfig | null = null;
  @Input() filterFields: FilterField[] = [];
  @Input() searchQuery: string = "";
  @Input() searchFields: string[] = [];
  @Input() excludeFields: string[] = [];
  showFilter = signal(false);
  isHovering = signal(false);
  isCompact = signal(false);
  ngOnInit(): void {
    this.updateCompact();
    if (typeof window !== "undefined") {
      window.addEventListener("resize", this.updateCompact.bind(this));
    }
  }
  ngOnDestroy(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("resize", this.updateCompact.bind(this));
    }
  }
  private updateCompact(): void {
    this.isCompact.set(window.innerWidth < 1024);
  }
  isDesktop(): boolean {
    return typeof window !== "undefined" ? window.innerWidth >= 1024 : true;
  }
  onModeSelect(mode: string): void {
    this.config?.viewMode?.onModeChange(mode as ViewMode);
  }
  getActiveViewMode(): ViewMode {
    return this.config?.viewMode?.mode || "card";
  }
  getViewModes(): ViewMode[] {
    return this.config?.viewMode?.modes || ["grid", "table", "list"];
  }
  getViewModeTabs(): SegmentOption[] {
    const modes = this.getViewModes();
    return modes.map((mode) => ({
      id: mode,
      label: mode.charAt(0).toUpperCase() + mode.slice(1),
      icon: this.getViewModeIcon(mode),
    }));
  }
  private getViewModeIcon(mode: ViewMode): string {
    switch (mode) {
      case "card":
        return "view_agenda";
      case "grid":
        return "grid_view";
      case "list":
        return "view_list";
      case "table":
        return "table_rows";
      case "kanban":
        return "view_kanban";
      default:
        return "view_agenda";
    }
  }
  @Output() filtersChange = new EventEmitter<Record<string, string | string[] | any>>();
  @Output() searchChange = new EventEmitter<string>();
  onToggleFilter(): void {
    this.showFilter.update((v) => !v);
    this.config?.filter?.onToggle?.();
    this.filterToggle.emit();
  }
  @Output() filterToggle = new EventEmitter<void>();
  onMouseEnter(): void {
    this.isHovering.set(true);
  }
  onMouseLeave(): void {
    this.isHovering.set(false);
  }
  onWheel(event: WheelEvent): void {
    if (!this.isHovering() || !this.config?.viewMode?.modes?.length) return;
    event.preventDefault();
    const modes = this.getViewModes();
    const currentIndex = modes.indexOf(this.getActiveViewMode());
    const direction = event.deltaY > 0 ? 1 : -1;
    const nextIndex = (currentIndex + direction + modes.length) % modes.length;
    this.onModeSelect(modes[nextIndex]);
  }
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
