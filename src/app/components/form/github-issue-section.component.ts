import { Component, Input, ChangeDetectionStrategy, forwardRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

@Component({
  selector: "app-github-issue-section",
  standalone: true,
  imports: [CommonModule, CheckboxComponent],
  templateUrl: "./github-issue-section.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => GithubIssueSectionComponent),
      multi: true,
    },
  ],
})
export class GithubIssueSectionComponent implements ControlValueAccessor {
  @Input() disabled = false;

  checked = false;

  private onChange: (value: boolean) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(obj: boolean): void {
    if (typeof obj === "boolean") {
      this.checked = obj;
    }
  }

  registerOnChange(fn: (value: boolean) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onCheckedChange(checked: boolean): void {
    this.checked = checked;
    this.onChange(checked);
    this.onTouched();
  }
}
