import { Component, Input, ChangeDetectionStrategy, forwardRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatDatepickerModule } from "@angular/material/datepicker";
import { MatNativeDateModule } from "@angular/material/core";
import { MatIconModule } from "@angular/material/icon";
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";

export interface TimelineValue {
  startDate: string | Date | null;
  endDate: string | Date | null;
  repeat: string;
}

@Component({
  selector: "app-timeline-section",
  standalone: true,
  imports: [
    CommonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatIconModule,
  ],
  templateUrl: "./timeline-section.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TimelineSectionComponent),
      multi: true,
    },
  ],
})
export class TimelineSectionComponent implements ControlValueAccessor {
  @Input() showRepeat = true;

  startDate: string | Date | null = null;
  endDate: string | Date | null = null;
  repeat = "none";

  private onChange: (value: TimelineValue) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(obj: TimelineValue): void {
    if (obj) {
      this.startDate = obj.startDate ?? null;
      this.endDate = obj.endDate ?? null;
      this.repeat = obj.repeat ?? "none";
    }
  }

  registerOnChange(fn: (value: TimelineValue) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  get minEndDate(): Date | null {
    if (!this.startDate) return null;
    return this.startDate instanceof Date ? this.startDate : new Date(this.startDate);
  }

  onStartDateChange(value: Date | null): void {
    this.startDate = value;
    this.emitChange();
  }

  onEndDateChange(value: Date | null): void {
    this.endDate = value;
    this.emitChange();
  }

  onRepeatChange(value: string): void {
    this.repeat = value;
    this.emitChange();
  }

  private emitChange(): void {
    this.onChange({
      startDate: this.startDate,
      endDate: this.endDate,
      repeat: this.repeat,
    });
    this.onTouched();
  }
}
