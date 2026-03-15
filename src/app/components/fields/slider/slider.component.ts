/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";
import { FormGroup, FormsModule, ReactiveFormsModule } from "@angular/forms";

/* materials */
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatSliderModule } from "@angular/material/slider";

/* models */
import { SliderField } from "@models/form-field.model";

@Component({
  selector: "app-slider",
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatFormFieldModule, MatSliderModule],
  templateUrl: "./slider.component.html",
})
export class SliderComponent {
  @Input() label: string = "";
  @Input() form!: FormGroup;
  @Input() field!: SliderField;

  isInvalid(attr: string): boolean {
    const control = this.form.get(attr);
    if (!control) return false;
    return (control.touched || control.dirty) && !!control.errors;
  }
}
