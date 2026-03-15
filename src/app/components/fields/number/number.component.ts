/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";
import { FormGroup, FormsModule, ReactiveFormsModule } from "@angular/forms";

/* materials */
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";

/* models */
import { NumberField } from "@models/form-field.model";

@Component({
  selector: "app-number",
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule],
  templateUrl: "./number.component.html",
})
export class NumberComponent {
  @Input() label: string = "";
  @Input() form!: FormGroup;
  @Input() field!: NumberField;

  isInvalid(attr: string): boolean {
    const control = this.form.get(attr);
    if (!control) return false;
    return (control.touched || control.dirty) && !!control.errors;
  }
}
