import { Component, Input, Output, EventEmitter, WritableSignal, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatSelectModule } from "@angular/material/select";
import { FilterConfig, FilterOption } from "@models/filter-config.model";

@Component({
  selector: "app-dynamic-filter-panel",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
  ],
  template: `
    <div class="flex h-full flex-col bg-white dark:bg-zinc-800">
      <!-- Header -->
      <div
        class="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-zinc-700"
      >
        <div class="flex items-center gap-2">
          <mat-icon class="h-5! w-5! min-w-5 text-xl! text-blue-600 dark:text-blue-400"
            >filter_list</mat-icon
          >
          <h3 class="textNormal text-lg font-semibold">{{ title }}</h3>
        </div>
        <button
          mat-icon-button
          (click)="onClose()"
          class="textMuted hover:textNormal"
          aria-label="Close filters"
        >
          <mat-icon class="h-5! w-5! min-w-5 text-xl!">close</mat-icon>
        </button>
      </div>

      <!-- Filter Body -->
      <div class="flex-1 overflow-y-auto p-4">
        <div class="flex flex-col gap-4">
          @for (filter of filters; track filter.key) {
            <div class="flex flex-col gap-2">
              <label class="textMuted block text-xs font-medium tracking-wide uppercase">
                {{ filter.label }}
              </label>

              @switch (filter.controlType) {
                @case ("text") {
                  <input
                    type="text"
                    [ngModel]="getFilterValue(filter.key)"
                    (ngModelChange)="onFilterChange(filter.key, $event)"
                    [placeholder]="filter.placeholder || ''"
                    class="textNormal w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-700"
                  />
                }
                @case ("select") {
                  <mat-form-field class="w-full">
                    <mat-select
                      [value]="getFilterValue(filter.key)"
                      (selectionChange)="onFilterChange(filter.key, $event.value)"
                      [compareWith]="compareFn"
                    >
                      @for (option of getFilterOptions(filter); track option.value || $index) {
                        <mat-option [value]="option.value">{{ option.label }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                }
                @case ("date") {
                  <input
                    type="date"
                    [ngModel]="getFilterValue(filter.key)"
                    (ngModelChange)="onFilterChange(filter.key, $event)"
                    class="textNormal w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-700"
                  />
                }
              }
            </div>
          }
        </div>
      </div>

      <!-- Footer Actions -->
      <div class="flex flex-col gap-2 border-t border-gray-200 p-4 dark:border-zinc-700">
        <button
          type="button"
          (click)="onClose()"
          class="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          Done
        </button>
        <button
          type="button"
          (click)="onClearAll()"
          class="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-gray-300 dark:hover:bg-zinc-600"
        >
          <mat-icon class="h-4! w-4! min-w-4 text-base!">clear_all</mat-icon>
          Clear All Filters
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
      }
    `,
  ],
})
export class DynamicFilterPanelComponent {
  @Input() title = "Filters";
  @Input() filters: FilterConfig[] = [];
  @Input() filterValues: Record<string, string> = {};
  @Input() getOptionsFn: (key: string) => FilterOption[] = () => [];

  @Output() filterChange = new EventEmitter<{ key: string; value: string }>();
  @Output() close = new EventEmitter<void>();
  @Output() clearAll = new EventEmitter<void>();

  compareFn = (a: string, b: string): boolean => a === b;

  getFilterValue(key: string): string {
    return this.filterValues[key] || "";
  }

  getFilterOptions(filter: FilterConfig): FilterOption[] {
    if (filter.options && filter.options.length > 0) {
      return filter.options;
    }
    if (filter.dynamicListKey) {
      return this.getOptionsFn(filter.key);
    }
    return this.getOptionsFn(filter.key);
  }

  onFilterChange(key: string, value: string): void {
    this.filterChange.emit({ key, value });
  }

  onClose(): void {
    this.close.emit();
  }

  onClearAll(): void {
    this.clearAll.emit();
  }
}
