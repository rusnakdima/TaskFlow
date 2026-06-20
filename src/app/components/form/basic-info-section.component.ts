import { Component, Input, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormGroup, ReactiveFormsModule, AbstractControl } from "@angular/forms";
import { FormSectionComponent } from "./form-section/form-section.component";
import { UnifiedFieldComponent } from "@components/fields/unified/unified-field.component";
import { TextField, TextareaField, TypeField } from "@entities/form-field.model";
@Component({
  selector: "app-basic-info-section",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormSectionComponent, UnifiedFieldComponent],
  templateUrl: "./basic-info-section.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BasicInfoSectionComponent {
  @Input() itemType = "";
  @Input() formGroup!: FormGroup | AbstractControl;
  titleFieldDef: TextField = {
    name: "title",
    label: "Title",
    type: TypeField.text,
    required: true,
    isShow: () => true,
  };
  descriptionFieldDef: TextareaField = {
    name: "description",
    label: "Description",
    type: TypeField.textarea,
    isShow: () => true,
  };
  onTitleChange(value: string): void {
    const control = this.formGroup.get("title");
    console.debug("title changed", {
      value,
      valid: !control?.invalid,
      errors: control?.errors,
    });
    control?.setValue(value);
  }
  onDescriptionChange(value: string): void {
    this.formGroup.get("description")?.setValue(value);
  }
}
