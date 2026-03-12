import { FormGroup } from "@angular/forms";
import { MatCalendarCellCssClasses } from "@angular/material/datepicker";

/**
 * Date helper utilities
 */
export class DateHelper {
  /**
   * Create a date class function for MatCalendar
   * Used to highlight the end date in the calendar
   */
  static createDateClass(form: FormGroup): (date: Date) => MatCalendarCellCssClasses {
    return (date: Date): MatCalendarCellCssClasses => {
      const endDateValue = form.get("endDate")?.value;
      if (endDateValue) {
        const endDate = new Date(endDateValue);
        return date.getDate() === endDate.getDate() &&
          date.getMonth() === endDate.getMonth() &&
          date.getFullYear() === endDate.getFullYear()
          ? "end-date-marker"
          : "";
      }
      return "";
    };
  }
}
