/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";
import { FormGroup, FormsModule, ReactiveFormsModule } from "@angular/forms";

/* materials */
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";

/* models */
import { TextField } from "@models/form-field.model";

@Component({
  selector: "app-text",
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule],
  templateUrl: "./text.component.html",
})
export class TextComponent {
  @Input() label: string = "";
  @Input() form!: FormGroup;
  @Input() field!: TextField;

  isInvalid(attr: string): boolean {
    const control = this.form.get(attr);
    if (!control) return false;
    return (control.touched || control.dirty) && !!control.errors;
  }
}
