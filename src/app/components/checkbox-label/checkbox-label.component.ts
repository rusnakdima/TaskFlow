/* sys lib */
import { Component, Input, Output, EventEmitter } from "@angular/core";
import { CommonModule } from "@angular/common";

/* components */
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

@Component({
  selector: "app-checkbox-label",
  standalone: true,
  imports: [CommonModule, CheckboxComponent],
  template: `
    <label
      class="inline-flex shrink-0 cursor-pointer items-center transition-all duration-200 select-none hover:scale-110"
      (click)="$event.stopPropagation()"
    >
      <app-checkbox [checked]="checked" (checkedChange)="onCheckedChange($event)" />
      @if (label) {
        <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">{{ label }}</span>
      }
    </label>
  `,
})
export class CheckboxLabelComponent {
  @Input() checked: boolean = false;
  @Input() label: string = "";

  @Output() checkedChange = new EventEmitter<boolean>();

  onCheckedChange(event: { checked: boolean; event?: MouseEvent }): void {
    this.checked = event.checked;
    this.checkedChange.emit(this.checked);
  }
}
