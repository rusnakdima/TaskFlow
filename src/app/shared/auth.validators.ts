import { AbstractControl, ValidationErrors, ValidatorFn } from "@angular/forms";
import { Common } from "@helpers/common.helper";
export function minLengthValidator(minLength: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (control.value && control.value.length < minLength) {
      return { minLength: { requiredLength: minLength, actualLength: control.value.length } };
    }
    return null;
  };
}
export function passwordMismatchValidator(passwordFieldName: string = "password"): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const parent = control.parent;
    if (!parent) return null;
    const password = parent.get(passwordFieldName)?.value;
    const confirmPassword = control.value;
    if (password && confirmPassword && password !== confirmPassword) {
      return { passwordMismatch: true };
    }
    return null;
  };
}
export function emailValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const email = control.value;
    if (email && !Common.isValidEmail(email)) {
      return { invalidEmail: true };
    }
    return null;
  };
}
export function patternValidator(pattern: RegExp, errorKey: string = "pattern"): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (control.value && !pattern.test(control.value)) {
      return { [errorKey]: true };
    }
    return null;
  };
}
