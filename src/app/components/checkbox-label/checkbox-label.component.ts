/* sys lib */
import { Component, Input, Output, EventEmitter } from "@angular/core";
import { CommonModule } from "@angular/common";

/* components */
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

@Component({
  selector: "app-checkbox-label",
  standalone: true,
  imports: [CommonModule, CheckboxComponent],
  templateUrl: "./checkbox-label.component.html",
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
