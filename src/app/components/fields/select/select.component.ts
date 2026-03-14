/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";
import { FormGroup, FormsModule, ReactiveFormsModule } from "@angular/forms";

/* materials */
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatSelectModule } from "@angular/material/select";

/* models */
import { SelectField } from "@models/form-field.model";

/* base */
import { BaseFieldComponent } from "../base-field.component";

@Component({
  selector: "app-select",
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatFormFieldModule, MatSelectModule],
  templateUrl: "./select.component.html",
})
export class SelectComponent extends BaseFieldComponent {
  override field!: SelectField;
  @Input() parentForm!: FormGroup;
}
