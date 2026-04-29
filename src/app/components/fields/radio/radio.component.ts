/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";
import { FormGroup, FormsModule, ReactiveFormsModule } from "@angular/forms";

import { MatFormFieldModule } from "@angular/material/form-field";
import { MatRadioModule } from "@angular/material/radio";

import { RadioField } from "@models/form-field.model";
import { BaseFieldComponent } from "../base-field.component";

@Component({
  selector: "app-radio",
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatFormFieldModule, MatRadioModule],
  templateUrl: "./radio.component.html",
})
export class RadioComponent extends BaseFieldComponent {
  @Input() parentForm!: FormGroup;
}
