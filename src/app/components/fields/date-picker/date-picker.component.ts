/* sys lib */
import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";

/* materials */
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatDatepickerModule } from "@angular/material/datepicker";
import { provideNativeDateAdapter } from "@angular/material/core";

/* models */
import { DatePickerField } from "@models/form-field.model";

/* base */
import { BaseFieldComponent } from "../base-field.component";

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
export class DatePickerComponent extends BaseFieldComponent {
  override field!: DatePickerField;
}
