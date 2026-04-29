/* sys lib */
import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
import { FormGroup, FormsModule, ReactiveFormsModule } from "@angular/forms";

import { MatFormFieldModule } from "@angular/material/form-field";
import { MatSliderModule } from "@angular/material/slider";

import { SliderField } from "@models/form-field.model";
import { BaseFieldComponent } from "../base-field.component";

@Component({
  selector: "app-slider",
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatFormFieldModule, MatSliderModule],
  templateUrl: "./slider.component.html",
})
export class SliderComponent extends BaseFieldComponent {}
