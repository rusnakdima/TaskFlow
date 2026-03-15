/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";
import { FormGroup, FormsModule, ReactiveFormsModule } from "@angular/forms";

/* materials */
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatRadioModule } from "@angular/material/radio";

/* models */
import { RadioField } from "@models/form-field.model";

@Component({
  selector: "app-radio",
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatFormFieldModule, MatRadioModule],
  templateUrl: "./radio.component.html",
})
export class RadioComponent {
  @Input() label: string = "";
  @Input() form!: FormGroup;
  @Input() field!: RadioField;
  @Input() parentForm!: FormGroup;

  isInvalid(attr: string): boolean {
    const control = this.form.get(attr);
    if (!control) return false;
    return (control.touched || control.dirty) && !!control.errors;
  }
}
