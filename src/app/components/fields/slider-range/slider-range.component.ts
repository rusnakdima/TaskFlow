/* sys lib */
import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';

/* materials */
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSliderModule } from '@angular/material/slider';

/* models */
import { SliderRangeField } from '@models/form-field';

@Component({
  selector: 'app-slider-range',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatSliderModule,
  ],
  templateUrl: './slider-range.component.html',
})
export class SliderRangeComponent {
  constructor() {}

  @Input() label: string = '';
  @Input() form!: FormGroup;
  @Input() field!: SliderRangeField;

  isInvalid(attr: string) {
    return (
      (this.form.get(attr)?.touched || this.form.get(attr)?.dirty) &&
      this.form.get(attr)?.errors
    );
  }
}
