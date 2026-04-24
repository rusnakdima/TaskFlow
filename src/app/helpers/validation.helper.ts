/* sys lib */
import { FormGroup } from "@angular/forms";

import { DateHelper } from "./date.helper";

export class ValidationHelper {
  static validateForm(form: FormGroup, notifyService: any, isSubmitting: boolean = false): boolean {
    if (form.invalid || isSubmitting) {
      Object.values(form.controls).forEach((control) => {
        control.markAsTouched();
      });
      if (form.invalid) {
        notifyService.showError("Please fill in all required fields");
      }
      return false;
    }

    return true;
  }

  static validateDates = DateHelper.validateDates;
  static createEndDateFilter = DateHelper.createEndDateFilter;
  static updateEndDateValidation = DateHelper.updateEndDateValidation;
}
