/* sys lib */
import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormGroup } from '@angular/forms';

/* models */
import { FormField } from '@models/form-field';

/* components */
import { TextComponent } from '@components/fields/text/text.component';
import { NumberComponent } from '@components/fields/number/number.component';
import { TextAreaComponent } from '@components/fields/text-area/text-area.component';
import { ImageComponent } from '@components/fields/image/image.component';
import { SelectComponent } from '@components/fields/select/select.component';
import { CheckboxComponent } from '@components/fields/checkbox/checkbox.component';
import { RadioComponent } from '@components/fields/radio/radio.component';
import { DatePickerComponent } from '@components/fields/date-picker/date-picker.component';
import { SlideToggleComponent } from '@components/fields/slide-toggle/slide-toggle.component';
import { SliderComponent } from '@components/fields/slider/slider.component';
import { SliderRangeComponent } from '@components/fields/slider-range/slider-range.component';

@Component({
  selector: 'app-block-fields',
  standalone: true,
  imports: [
    CommonModule,
    TextComponent,
    NumberComponent,
    TextAreaComponent,
    ImageComponent,
    DatePickerComponent,
    SlideToggleComponent,
    SelectComponent,
    CheckboxComponent,
    RadioComponent,
    SliderComponent,
    SliderRangeComponent,
  ],
  templateUrl: './block-fields.component.html',
})
export class BlockFieldsComponent {
  constructor() {}

  @Input() parentForm!: FormGroup;
  @Input() formG!: FormGroup;
  @Input() field!: FormField;

  getLabel() {
    if (this.field!.label instanceof Function) {
      return this.field!.label(this.formG);
    } else {
      return this.field!.label;
    }
  }
}
