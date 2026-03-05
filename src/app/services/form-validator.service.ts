/* sys lib */
import { Injectable } from "@angular/core";
import { FormGroup } from "@angular/forms";

/* services */
import { NotifyService } from "@services/notify.service";

/**
 * FormValidatorService - Reusable form validation logic
 * Used across manage-task, manage-subtask, manage-todo views
 */
@Injectable({
  providedIn: "root",
})
export class FormValidatorService {
  constructor(private notifyService: NotifyService) {}

  /**
   * Validate form and mark all controls as touched
   * @param form - FormGroup to validate
   * @param isSubmitting - Signal or boolean indicating if form is currently submitting
   * @returns true if form is valid and can proceed, false otherwise
   */
  validateForm(form: FormGroup, isSubmitting: boolean = false): boolean {
    if (form.invalid || isSubmitting) {
      Object.values(form.controls).forEach((control) => {
        control.markAsTouched();
      });

      if (form.invalid) {
        this.notifyService.showError("Please fill in all required fields");
        return false;
      }

      return false;
    }

    return true;
  }

  /**
   * Mark all form controls as touched (for error display)
   * @param form - FormGroup to mark
   */
  markAllControlsAsTouched(form: FormGroup): void {
    Object.values(form.controls).forEach((control) => {
      control.markAsTouched();
    });
  }

  /**
   * Validate required fields
   * @param form - FormGroup to validate
   * @param fieldNames - Array of field names to check
   * @returns true if all required fields are filled, false otherwise
   */
  validateRequiredFields(form: FormGroup, fieldNames: string[]): boolean {
    const missingFields = fieldNames.filter((fieldName) => {
      const control = form.get(fieldName);
      return !control?.value || control?.value === "";
    });

    if (missingFields.length > 0) {
      this.notifyService.showError("Please fill in all required fields");
      return false;
    }

    return true;
  }
}
