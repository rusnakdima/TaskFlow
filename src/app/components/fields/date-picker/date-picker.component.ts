/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { FormGroup, FormsModule, ReactiveFormsModule } from "@angular/forms";
import { MatCalendarCellCssClasses } from "@angular/material/datepicker";

import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatDatepickerModule } from "@angular/material/datepicker";
import { provideNativeDateAdapter } from "@angular/material/core";

import { DatePickerField } from "@models/form-field.model";
import { BaseFieldComponent } from "../base-field.component";

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
export class DatePickerComponent extends BaseFieldComponent implements OnInit {
  dateClass!: (date: Date) => MatCalendarCellCssClasses;

  ngOnInit(): void {
    this.dateClass = (date: Date): MatCalendarCellCssClasses => {
      const today = new Date();
      return date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear()
        ? "today-marker"
        : "";
    };
  }
}
