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
}
