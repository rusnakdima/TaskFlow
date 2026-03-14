/* sys lib */
import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";

/* materials */
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";

/* models */
import { NumberField } from "@models/form-field.model";

/* base */
import { BaseFieldComponent } from "../base-field.component";

@Component({
  selector: "app-number",
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule],
  templateUrl: "./number.component.html",
})
export class NumberComponent extends BaseFieldComponent {
  override field!: NumberField;
}
