/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, Input, OnInit } from "@angular/core";
import { FormGroup, FormsModule, ReactiveFormsModule } from "@angular/forms";
import { MatCalendarCellCssClasses } from "@angular/material/datepicker";

/* materials */
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatDatepickerModule } from "@angular/material/datepicker";
import { provideNativeDateAdapter } from "@angular/material/core";

/* models */
import { DatePickerField } from "@models/form-field.model";

/* helpers */
import { DateHelper } from "@helpers/date.helper";

@Component({
  selector: "app-date-picker",
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
  templateUrl: "./date-picker.component.html",
})
export class DatePickerComponent implements OnInit {
  @Input() label: string = "";
  @Input() form!: FormGroup;
  @Input() field!: DatePickerField;

  dateClass!: (date: Date) => MatCalendarCellCssClasses;

  ngOnInit(): void {
    this.dateClass = DateHelper.createTodayDateClass();
  }

  isInvalid(attr: string): boolean {
    const control = this.form.get(attr);
    if (!control) return false;
    return (control.touched || control.dirty) && !!control.errors;
  }
}
