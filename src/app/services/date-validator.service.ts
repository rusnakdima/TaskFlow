/* sys lib */
import { Injectable } from "@angular/core";
import { FormGroup } from "@angular/forms";

/* services */
import { NotifyService } from "@services/notify.service";

/**
 * DateValidatorService - Reusable date validation logic
 * Used across manage-task, manage-subtask, manage-todo views
 */
@Injectable({
  providedIn: "root",
})
export class DateValidatorService {
  constructor(private notifyService: NotifyService) {}

  /**
   * Validate dates from a FormGroup
   * @param form - FormGroup with startDate and endDate controls
   * @returns true if dates are valid, false otherwise
   */
  validateDatesFromForm(form: FormGroup): boolean {
    const startDate = form.get("startDate")?.value;
    const endDate = form.get("endDate")?.value;

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (end < start) {
        this.notifyService.showError("End date cannot be earlier than start date");
        return false;
      }
    }

    // Clear end date if start date is empty
    if (!startDate && endDate) {
      form.get("endDate")?.setValue("");
    }

    return true;
  }

  /**
   * Create end date filter function for date pickers
   * @param startDateControl - Form control name for start date
   * @param form - FormGroup containing the date controls
   * @returns Filter function for MatDatepicker
   */
  createEndDateFilter(startDateControl: string, form: FormGroup) {
    return (date: Date | null): boolean => {
      const startDateValue = form.get(startDateControl)?.value;
      if (!startDateValue) {
        return true;
      }

      if (!date) {
        return false;
      }

      const startDate = new Date(startDateValue);
      startDate.setHours(0, 0, 0, 0);
      return date >= startDate;
    };
  }

  /**
   * Update end date validation when start date changes
   * @param form - FormGroup with startDate and endDate controls
   * @param startDate - New start date value
   */
  updateEndDateValidation(form: FormGroup, startDate: string): void {
    const endDateControl = form.get("endDate");
    if (!startDate) {
      endDateControl?.setValue("");
    } else {
      const currentEndDate = endDateControl?.value;
      if (startDate && currentEndDate) {
        const start = new Date(startDate);
        const end = new Date(currentEndDate);
        if (end < start) {
          endDateControl?.setValue("");
        }
      }
    }
  }
}
