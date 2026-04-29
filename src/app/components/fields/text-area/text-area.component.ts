/* sys lib */
import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
import { FormGroup, FormsModule, ReactiveFormsModule } from "@angular/forms";

import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";

import { TextareaField } from "@models/form-field.model";
import { BaseFieldComponent } from "../base-field.component";

@Component({
  selector: "app-text-area",
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule],
  templateUrl: "./text-area.component.html",
})
export class TextAreaComponent extends BaseFieldComponent {}
