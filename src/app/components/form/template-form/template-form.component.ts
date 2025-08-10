/* sys lib */
import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormArray, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';

/* materials */
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';

/* models */
import { FormField } from '@models/form-field';

/* components */
import { BlockFieldsComponent } from '../block-fields/block-fields.component';

@Component({
  selector: 'app-template-form',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatMenuModule,
    BlockFieldsComponent,
  ],
  templateUrl: './template-form.component.html',
})
export class TemplateFormComponent {
  constructor() {}

  @Input() parentForm!: FormGroup;
  @Input() form!: FormGroup;
  @Input() formFields!: Array<FormField>;
  @Input() index: number = -1;
  @Input() direction: 'vertical' | 'horizontal' = 'vertical';

  @Output() addRecordToList: EventEmitter<void> = new EventEmitter<void>();
  @Output() insertRecordToList: EventEmitter<number> = new EventEmitter<number>();
  @Output() removeRecordToList: EventEmitter<number> = new EventEmitter<number>();

  openStates: boolean[] = [];

  isInvalid(attr: string) {
    return (
      (this.form.get(attr)?.touched || this.form.get(attr)?.dirty) && this.form.get(attr)?.errors
    );
  }

  formGroup(fieldName: string): FormGroup {
    const control = this.form.get(fieldName);
    if (!(control instanceof FormGroup)) {
      throw new Error(`Control '${fieldName}' is not a FormGroup`);
    }
    return control;
  }

  formArray(fieldName: string): FormArray {
    return this.form.get(fieldName) as FormArray;
  }

  formGroupForArray(fieldName: string, index: number): FormGroup {
    return this.formArray(fieldName).controls[index] as FormGroup;
  }

  onAddRecord() {
    this.addRecordToList.next();
  }

  onInsertRecord(index: number) {
    this.insertRecordToList.next(index);
  }

  onRemoveRecord(index: number) {
    this.removeRecordToList.next(index);
  }
}
