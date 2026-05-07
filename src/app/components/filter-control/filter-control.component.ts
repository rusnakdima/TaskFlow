import { Component, Input, Output, EventEmitter, Signal, standalone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { FilterConfig, FilterOption } from '@models/filter-config.model';

@Component({
  selector: 'app-filter-control',
  standalone: true,
  imports: [CommonModule, FormsModule, MatFormFieldModule, MatSelectModule],
  template: `
    <div class="flex flex-col gap-y-3">
      <label class="textMuted block text-xs font-medium tracking-wide uppercase">
        {{ config.label }}
      </label>
      
      @switch (config.controlType) {
        @case ('text') {
          <input
            type="text"
            [ngModel]="value()"
            (ngModelChange)="onValueChange($event)"
            [placeholder]="config.placeholder || ''"
            class="textNormal w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm 
                   focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none 
                   dark:border-zinc-600 dark:bg-zinc-700"
          />
        }
        @case ('select') {
          <mat-form-field class="w-full">
            <mat-select [ngModel]="value()" (ngModelChange)="onValueChange($event)">
              @for (option of getOptions(); track option.value) {
                <mat-option [value]="option.value">{{ option.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
        @case ('date') {
          <input
            type="date"
            [ngModel]="value()"
            (ngModelChange)="onValueChange($event)"
            class="textNormal w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm 
                   focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none 
                   dark:border-zinc-600 dark:bg-zinc-700"
          />
        }
      }
    </div>
  `
})
export class FilterControlComponent {
  @Input() config!: FilterConfig;
  @Input() options: FilterOption[] = [];
  @Input() value: Signal<string> = () => '';
  @Output() valueChange = new EventEmitter<string>();

  getOptions(): FilterOption[] {
    if (this.config.options && this.config.options.length > 0) {
      return this.config.options;
    }
    return this.options;
  }

  onValueChange(newValue: string): void {
    this.valueChange.emit(newValue);
  }
}