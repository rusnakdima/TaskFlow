/* sys lib */
import { Component, Input } from "@angular/core";
import { FormGroup } from "@angular/forms";

/**
 * Base component for all form field components.
 * Provides common properties and methods for form field handling.
 */
@Component({
  selector: "app-base-field",
  standalone: true,
  template: "",
})
export abstract class BaseFieldComponent {
  @Input() label: string = "";
  @Input() form!: FormGroup;
  @Input() field: any;

  /**
   * Check if a form control is invalid
   */
  isInvalid(attr: string): boolean {
    const control = this.form.get(attr);
    if (!control) return false;
    return (control.touched || control.dirty) && !!control.errors;
  }
}
