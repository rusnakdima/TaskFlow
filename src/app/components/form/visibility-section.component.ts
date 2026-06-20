import {
  Component,
  Input,
  ChangeDetectionStrategy,
  forwardRef,
  Output,
  EventEmitter,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatRadioModule } from "@angular/material/radio";
import { MatIconModule } from "@angular/material/icon";
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";
@Component({
  selector: "app-visibility-section",
  standalone: true,
  imports: [CommonModule, MatRadioModule, MatIconModule],
  templateUrl: "./visibility-section.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => VisibilitySectionComponent),
      multi: true,
    },
  ],
})
export class VisibilitySectionComponent implements ControlValueAccessor {
  @Input() disabled = false;
  @Input()
  get visibility(): string {
    return this._visibility;
  }
  set visibility(value: string) {
    this._visibility = value;
  }
  @Output() visibilityChange = new EventEmitter<string>();
  private _visibility = "private";
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};
  writeValue(obj: string): void {
    if (obj) {
      this._visibility = obj;
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
  onVisibilityChange(value: string): void {
    this._visibility = value;
    this.visibilityChange.emit(value);
    this.onChange(value);
    this.onTouched();
  }
}
