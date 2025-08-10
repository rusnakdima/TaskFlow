/* sys lib */
import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';

/* materials */
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

/* models */
import { SlideToggleField } from '@models/form-field';

@Component({
  selector: 'app-slide-toggle',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatSlideToggleModule,
  ],
  templateUrl: './slide-toggle.component.html',
})
export class SlideToggleComponent {
  constructor() {}

  @Input() label: string = '';
  @Input() form!: FormGroup;
  @Input() field!: SlideToggleField;

  isInvalid(attr: string) {
    return (
      (this.form.get(attr)?.touched || this.form.get(attr)?.dirty) &&
      this.form.get(attr)?.errors
    );
  }
}
