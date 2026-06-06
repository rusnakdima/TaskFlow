import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormGroup, FormsModule, ReactiveFormsModule } from "@angular/forms";

import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatRadioModule } from "@angular/material/radio";
import { MatDatepickerModule } from "@angular/material/datepicker";
import { MatNativeDateModule } from "@angular/material/core";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { MatSliderModule } from "@angular/material/slider";

import { FormField, OptionData, TypeField } from "@models/form-field.model";

@Component({
  selector: "app-unified-field",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatRadioModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSlideToggleModule,
    MatSliderModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./unified-field.component.html",
  styleUrl: "./unified-field.styles.css",
})
export class UnifiedFieldComponent {
  @Input() field!: FormField;
  @Input() form!: FormGroup;
  @Input() appearance: "outline" | "fill" = "outline";
  @Input() showError: boolean = true;
  @Input() class: string = "";

  @Output() valueChange = new EventEmitter<any>();

  TypeField = TypeField;

  getLabel(): string {
    if (!this.field?.label) return "";
    if (this.field.label instanceof Function) {
      return this.field.label(this.form);
    }
    return this.field.label;
  }

  isShow(): boolean {
    if (!this.field?.isShow) return true;
    return this.field.isShow(this.form);
  }

  isInvalid(attr: string): boolean {
    const control = this.form?.get(attr);
    if (!control) return false;
    return (control.touched || control.dirty) && !!control.errors;
  }

  getErrorMessage(fieldName: string): string {
    const control = this.form?.get(fieldName);
    if (!control?.errors) return "";

    if (control.errors["required"]) {
      return `Field '${this.getLabel()}' should not be empty`;
    }
    if (control.errors["minlength"]) {
      return `Field '${this.getLabel()}' must be at least ${control.errors["minlength"].requiredLength} characters long`;
    }
    if (control.errors["email"]) {
      return `Field '${this.getLabel()}' contains an incorrect email address`;
    }
    if (control.errors["pattern"]) {
      return `Field '${this.getLabel()}' contains invalid characters`;
    }
    if (control.errors["min"]) {
      return `Value must be at least ${control.errors["min"].min}`;
    }
    if (control.errors["max"]) {
      return `Value must be at most ${control.errors["max"].max}`;
    }
    return `Invalid value for '${this.getLabel()}'`;
  }

  getOptions(): OptionData[] {
    if (!this.field || !("options" in this.field)) return [];
    return (this.field as any).options || [];
  }

  isOptionVisible(option: OptionData): boolean {
    return option.isShow(this.form);
  }

  onValueChange(value: any) {
    this.valueChange.emit(value);
  }

  getMin(): number {
    return (this.field as any).min ?? 0;
  }

  getMax(): number {
    return (this.field as any).max ?? 100;
  }

  trackByValue(_index: number, item: OptionData): string {
    return item.value;
  }
}
