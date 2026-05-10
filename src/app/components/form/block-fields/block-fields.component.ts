import { Component, Input, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormGroup, ReactiveFormsModule } from "@angular/forms";

import { FormField } from "@models/form-field.model";

import { TextComponent } from "@components/fields/text/text.component";
import { TextAreaComponent } from "@components/fields/text-area/text-area.component";
import { NumberComponent } from "@components/fields/number/number.component";
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";
import { SelectComponent } from "@components/fields/select/select.component";
import { SlideToggleComponent } from "@components/fields/slide-toggle/slide-toggle.component";
import { DatePickerComponent } from "@components/fields/date-picker/date-picker.component";
import { SearchComponent } from "@components/fields/search/search.component";

@Component({
  selector: "app-block-fields",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TextComponent,
    TextAreaComponent,
    NumberComponent,
    CheckboxComponent,
    SelectComponent,
    SlideToggleComponent,
    DatePickerComponent,
    SearchComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (field.type) {
      @case ("text") {
        <app-text [parentForm]="parentForm" [formG]="formG" [field]="field" />
      }
      @case ("textarea") {
        <app-text-area [parentForm]="parentForm" [formG]="formG" [field]="field" />
      }
      @case ("number") {
        <app-number [parentForm]="parentForm" [formG]="formG" [field]="field" />
      }
      @case ("checkbox") {
        <app-checkbox [parentForm]="parentForm" [formG]="formG" [field]="field" />
      }
      @case ("select") {
        <app-select [parentForm]="parentForm" [formG]="formG" [field]="field" />
      }
      @case ("toggle") {
        <app-slide-toggle [parentForm]="parentForm" [formG]="formG" [field]="field" />
      }
      @case ("date") {
        <app-date-picker [parentForm]="parentForm" [formG]="formG" [field]="field" />
      }
      @case ("search") {
        <app-search [parentForm]="parentForm" [formG]="formG" [field]="field" />
      }
    }
  `,
})
export class BlockFieldsComponent {
  @Input() parentForm!: FormGroup;
  @Input() formG!: FormGroup;
  @Input() field!: FormField;
}
