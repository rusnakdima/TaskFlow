import {
  Component,
  Input,
  ChangeDetectionStrategy,
  forwardRef,
  Output,
  EventEmitter,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ControlValueAccessor,
  NG_VALUE_ACCESSOR,
} from "@angular/forms";
import { FormSectionComponent } from "./form-section/form-section.component";
import { UnifiedFieldComponent } from "@components/fields/unified/unified-field.component";
import { TextField, TextareaField, TypeField } from "@models/form-field.model";

export interface BasicInfoValue {
  title: string;
  description: string;
}

@Component({
  selector: "app-basic-info-section",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormSectionComponent, UnifiedFieldComponent],
  templateUrl: "./basic-info-section.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => BasicInfoSectionComponent),
      multi: true,
    },
  ],
})
export class BasicInfoSectionComponent implements ControlValueAccessor {
  @Input() itemType = "";

  @Input()
  get title(): string {
    return this._title;
  }
  set title(value: string) {
    this._title = value;
  }

  @Input()
  get description(): string {
    return this._description;
  }
  set description(value: string) {
    this._description = value;
  }

  @Output() titleChange = new EventEmitter<string>();
  @Output() descriptionChange = new EventEmitter<string>();

  private _title = "";
  private _description = "";

  titleFormControl = new FormControl("");
  descriptionFormControl = new FormControl("");

  basicInfoFormGroup = new FormGroup({
    title: this.titleFormControl,
    description: this.descriptionFormControl,
  });

  titleFieldDef: TextField = {
    name: "title",
    label: "Title",
    type: TypeField.text,
    isShow: () => true,
  };

  descriptionFieldDef: TextareaField = {
    name: "description",
    label: "Description",
    type: TypeField.textarea,
    isShow: () => true,
  };

  private onChange: (value: BasicInfoValue) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(obj: BasicInfoValue): void {
    if (obj) {
      this._title = obj.title ?? "";
      this._description = obj.description ?? "";

      this.titleFormControl.setValue(this._title, { emitEvent: false });
      this.descriptionFormControl.setValue(this._description, { emitEvent: false });
    }
  }

  registerOnChange(fn: (value: BasicInfoValue) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  onTitleChange(value: string): void {
    this._title = value;
    this.titleChange.emit(value);
    this.onChange({ title: this._title, description: this._description });
    this.onTouched();
  }

  onDescriptionChange(value: string): void {
    this._description = value;
    this.descriptionChange.emit(value);
    this.onChange({ title: this._title, description: this._description });
    this.onTouched();
  }
}
