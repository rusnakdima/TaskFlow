import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormGroup, ReactiveFormsModule } from "@angular/forms";

import { FormField } from "@models/form-field.model";
import { UnifiedFieldComponent } from "@components/fields/unified/unified-field.component";

export interface FormSection {
  title: string;
  fields: FormField[];
}

@Component({
  selector: "app-unified-form",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, UnifiedFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./unified-form.component.html",
})
export class UnifiedFormComponent {
  @Input() form!: FormGroup;
  @Input() fields: FormField[] = [];
  @Input() appearance: "outline" | "fill" | "standard" = "outline";
  @Input() showErrors: boolean = true;

  @Output() valueChange = new EventEmitter<any>();

  getSections(): FormSection[] {
    if (!this.fields || this.fields.length === 0) {
      return [];
    }

    const sectionMap = new Map<string, FormField[]>();
    const noSectionFields: FormField[] = [];

    for (const field of this.fields) {
      const section = (field as any).section as string | undefined;
      if (section) {
        if (!sectionMap.has(section)) {
          sectionMap.set(section, []);
        }
        sectionMap.get(section)!.push(field);
      } else {
        noSectionFields.push(field);
      }
    }

    const sections: FormSection[] = [];

    if (noSectionFields.length > 0) {
      sections.push({ title: "", fields: noSectionFields });
    }

    sectionMap.forEach((fields, title) => {
      sections.push({ title, fields });
    });

    return sections;
  }

  trackByFieldName(_index: number, field: FormField): string {
    return field.name;
  }

  trackBySectionTitle(_index: number, section: FormSection): string {
    return section.title || "__default__";
  }

  onFieldValueChange(value: any) {
    this.valueChange.emit(value);
  }
}
