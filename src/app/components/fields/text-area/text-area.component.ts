/* sys lib */
import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';

/* materials */
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

/* models */
import { TextareaField } from '@models/form-field';

@Component({
  selector: 'app-text-area',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './text-area.component.html',
})
export class TextAreaComponent {
  constructor() {}

  @Input() label: string = '';
  @Input() form!: FormGroup;
  @Input() field!: TextareaField;

  isInvalid(attr: string) {
    return (
      (this.form.get(attr)?.touched || this.form.get(attr)?.dirty) &&
      this.form.get(attr)?.errors
    );
  }
}
