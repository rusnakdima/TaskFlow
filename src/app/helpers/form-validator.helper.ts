/* sys lib */
import { FormGroup } from "@angular/forms";

/* services */
import { NotifyService } from "@services/notifications/notify.service";

/**
 * FormValidatorHelper - Reusable form validation logic
 * Used across manage-task, manage-subtask, manage-todo views
 */
export class FormValidatorHelper {
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
}
