import { MatCalendarCellCssClasses } from "@angular/material/datepicker";
import { FormGroup } from "@angular/forms";

/**
 * Creates a CSS class function for highlighting the end date on calendar
 */
export function createDateClass(form: FormGroup) {
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
