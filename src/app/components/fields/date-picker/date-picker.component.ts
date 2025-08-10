/* sys lib */
import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';

/* materials */
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { provideNativeDateAdapter } from '@angular/material/core';

/* models */
import { DatePickerField } from '@models/form-field';

@Component({
  selector: 'app-date-picker',
  standalone: true,
  providers: [provideNativeDateAdapter()],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
  ],
  templateUrl: './date-picker.component.html',
})
export class DatePickerComponent {
  constructor() {}

  @Input() label: string = '';
  @Input() form!: FormGroup;
  @Input() field!: DatePickerField;

  isInvalid(attr: string) {
    return (
      (this.form.get(attr)?.touched || this.form.get(attr)?.dirty) &&
      this.form.get(attr)?.errors
    );
  }
}
