/* sys lib */
import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';

/* materials */
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatRadioModule } from '@angular/material/radio';

/* models */
import { RadioField } from '@models/form-field';

@Component({
  selector: 'app-radio',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatFormFieldModule, MatRadioModule],
  templateUrl: './radio.component.html',
})
export class RadioComponent {
  constructor() {}

  @Input() label: string = '';
  @Input() parentForm!: FormGroup;
  @Input() form!: FormGroup;
  @Input() field!: RadioField;

  isInvalid(attr: string) {
    return (
      (this.form.get(attr)?.touched || this.form.get(attr)?.dirty) && this.form.get(attr)?.errors
    );
  }
}
