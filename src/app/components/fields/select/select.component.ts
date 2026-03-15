/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";
import { FormGroup, FormsModule, ReactiveFormsModule } from "@angular/forms";

/* materials */
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatSelectModule } from "@angular/material/select";

/* models */
import { SelectField } from "@models/form-field.model";

@Component({
  selector: "app-select",
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatFormFieldModule, MatSelectModule],
  templateUrl: "./select.component.html",
})
export class SelectComponent {
  @Input() label: string = "";
  @Input() form!: FormGroup;
  @Input() field!: SelectField;
  @Input() parentForm!: FormGroup;

  isInvalid(attr: string): boolean {
    const control = this.form.get(attr);
    if (!control) return false;
    return (control.touched || control.dirty) && !!control.errors;
  }
}
