/* sys lib */
import { CommonModule, NgClass } from "@angular/common";
import { Component, Input, Output, EventEmitter } from "@angular/core";
import { FormGroup, FormsModule, ReactiveFormsModule } from "@angular/forms";

/* materials */
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatCheckboxModule } from "@angular/material/checkbox";

/* models */
import { CheckboxField } from "@models/form-field.model";

@Component({
  selector: "app-checkbox",
  standalone: true,
  imports: [
    CommonModule,
    NgClass,
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatCheckboxModule,
  ],
  templateUrl: "./checkbox.component.html",
})
export class CheckboxComponent {
  @Input() label: string = "";
  @Input() form?: FormGroup;
  @Input() field?: CheckboxField;
  @Input() checked: boolean = false;
  @Input() indeterminate: boolean = false;
  @Input() highlight: boolean = false;
  @Output() checkedChange = new EventEmitter<boolean>();

  onToggle(event: any) {
    this.checked = event.checked;
    this.checkedChange.emit(this.checked);
  }

  isInvalid(attr?: string) {
    if (!this.form || !attr) return false;
    return (
      (this.form.get(attr)?.touched || this.form.get(attr)?.dirty) && this.form.get(attr)?.errors
    );
  }
}
