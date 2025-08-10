/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { FormGroup, FormsModule, ReactiveFormsModule } from "@angular/forms";

/* models */
import { FormField } from "@models/form-field";
import { TemplateFormComponent } from "./template-form/template-form.component";

@Component({
  selector: "app-form",
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TemplateFormComponent],
  templateUrl: "./form.component.html",
})
export class FormComponent {
  constructor() {}

  @Input() form?: FormGroup;
  @Input() formFields: Array<FormField> = [];

  @Output() close: EventEmitter<void> = new EventEmitter<void>();
  @Output() onSubmit: EventEmitter<void> = new EventEmitter<void>();
  @Output() addRecordToList: EventEmitter<void> = new EventEmitter<void>();
  @Output() insertRecordToList: EventEmitter<number> = new EventEmitter<number>();
  @Output() removeRecordToList: EventEmitter<number> = new EventEmitter<number>();

  closeForm() {
    this.close.emit();
  }

  onSubmitForm() {
    this.onSubmit.emit();
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
