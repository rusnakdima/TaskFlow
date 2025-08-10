/* sys lib */
import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';

/* materials */
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCheckboxModule } from '@angular/material/checkbox';

/* models */
import { CheckboxField } from '@models/form-field';

@Component({
  selector: 'app-checkbox',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatCheckboxModule,
  ],
  templateUrl: './checkbox.component.html',
})
export class CheckboxComponent {
  constructor() {}

  @Input() label: string = '';
  @Input() form!: FormGroup;
  @Input() field!: CheckboxField;

  isInvalid(attr: string) {
    return (
      (this.form.get(attr)?.touched || this.form.get(attr)?.dirty) &&
      this.form.get(attr)?.errors
    );
  }
}
