import {
  Component,
  Input,
  ChangeDetectionStrategy,
  forwardRef,
  Output,
  EventEmitter,
  inject,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatRadioModule } from "@angular/material/radio";
import { MatIconModule } from "@angular/material/icon";
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";
import { LoggerService } from "@shared/services/logger.service";

@Component({
  selector: "app-priority-section",
  standalone: true,
  imports: [CommonModule, MatRadioModule, MatIconModule],
  templateUrl: "./priority-section.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => PrioritySectionComponent),
      multi: true,
    },
  ],
})
export class PrioritySectionComponent implements ControlValueAccessor {
  @Input() disabled = false;
  @Input() required = false;

  @Input()
  get priority(): string {
    return this._priority;
  }
  set priority(value: string) {
    this._priority = value;
  }

  @Output() priorityChange = new EventEmitter<string>();

  private _priority = "medium";

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};
  private loggingService = inject(LoggerService);

  writeValue(obj: string): void {
    this.loggingService.debug("writeValue", { value: obj });
    if (obj) {
      this._priority = obj;
    }
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onPriorityChange(value: string): void {
    this.loggingService.debug("priority changed", { value });
    this._priority = value;
    this.priorityChange.emit(value);
    this.onChange(value);
    this.onTouched();
  }
}
