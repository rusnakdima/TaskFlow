import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatDatepickerModule } from "@angular/material/datepicker";
import { MatNativeDateModule } from "@angular/material/core";
import { MatIconModule } from "@angular/material/icon";
import { FormsModule } from "@angular/forms";

@Component({
  selector: "app-timeline-section",
  standalone: true,
  imports: [
    CommonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatIconModule,
    FormsModule,
  ],
  templateUrl: "./timeline-section.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimelineSectionComponent {
  @Input() startDate: string | Date | null = null;
  @Input() endDate: string | Date | null = null;
  @Input() repeat = "none";
  @Input() showRepeat = true;
  @Output() startDateChange = new EventEmitter<string | Date | null>();
  @Output() endDateChange = new EventEmitter<string | Date | null>();
  @Output() repeatChange = new EventEmitter<string>();

  get minEndDate(): Date | null {
    if (!this.startDate) return null;
    return this.startDate instanceof Date ? this.startDate : new Date(this.startDate);
  }
}
