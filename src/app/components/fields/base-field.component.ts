import { Component, Input } from "@angular/core";
import { FormGroup } from "@angular/forms";

@Component({
  selector: 'app-base-field',
  standalone: true,
  template: ''
})
export abstract class BaseFieldComponent {
  @Input() label: string = "";
  @Input() form!: FormGroup;
  @Input() field!: any;

  isInvalid(attr: string): boolean {
    const control = this.form.get(attr);
    if (!control) return false;
    return (control.touched || control.dirty) && !!control.errors;
  }
}