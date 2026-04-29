/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";
import { FormGroup, FormsModule, ReactiveFormsModule } from "@angular/forms";

import { MatFormFieldModule } from "@angular/material/form-field";
import { MatSelectModule } from "@angular/material/select";

import { SelectField } from "@models/form-field.model";
import { BaseFieldComponent } from "../base-field.component";

@Component({
  selector: "app-select",
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatFormFieldModule, MatSelectModule],
  templateUrl: "./select.component.html",
})
export class SelectComponent extends BaseFieldComponent {
  @Input() parentForm!: FormGroup;
}
