import { Component, Input, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormGroup } from "@angular/forms";
import { FormField, TypeField } from "@entities/form-field.model";
import { UnifiedFieldComponent } from "@components/fields/unified/unified-field.component";
@Component({
  selector: "app-block-fields",
  standalone: true,
  imports: [CommonModule, UnifiedFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./block-fields.component.html",
})
export class BlockFieldsComponent {
  @Input() formG!: FormGroup;
  @Input() field!: FormField;
  TypeField = TypeField;
  getLabel(): string {
    if (this.field?.label instanceof Function) {
      return this.field.label(this.formG);
    } else {
      return this.field?.label || "";
    }
  }
}
