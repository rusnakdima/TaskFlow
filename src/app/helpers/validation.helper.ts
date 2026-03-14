/* sys lib */
import { FormGroup } from "@angular/forms";

/**
 * ValidationHelper - Reusable form validation logic
 * Used across manage-task, manage-subtask, manage-todo views
 */
export class ValidationHelper {
  /**
   * Validate form and mark all controls as touched
   * @param form - FormGroup to validate
   * @param notifyService - NotifyService for showing errors
   * @param isSubmitting - Signal or boolean indicating if form is currently submitting
   * @returns true if form is valid and can proceed, false otherwise
   */
  static validateForm(form: FormGroup, notifyService: any, isSubmitting: boolean = false): boolean {
    if (form.invalid || isSubmitting) {
      Object.values(form.controls).forEach((control) => {
        control.markAsTouched();
      });

      if (form.invalid) {
        notifyService.showError("Please fill in all required fields");
        return false;
      }

      return false;
    }

    return true;
  }

  /**
   * Validate dates from a FormGroup
   * @param form - FormGroup with startDate and endDate controls
   * @param notifyService - NotifyService for showing errors
   * @returns true if dates are valid, false otherwise
   */
  static validateDates(form: FormGroup, notifyService: any): boolean {
    const startDate = form.get("startDate")?.value;
    const endDate = form.get("endDate")?.value;

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (end < start) {
        notifyService.showError("End date cannot be earlier than start date");
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
  static createEndDateFilter(startDateControl: string, form: FormGroup) {
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
  static updateEndDateValidation(form: FormGroup, startDate: string): void {
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
