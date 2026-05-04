import { Component } from "@angular/core";
import { BaseFieldComponent } from "@components/fields/base-field.component";

@Component({
  selector: "app-field-wrapper",
  standalone: true,
  templateUrl: "./field-wrapper.component.html",
})
export class FieldWrapperComponent extends BaseFieldComponent {}
