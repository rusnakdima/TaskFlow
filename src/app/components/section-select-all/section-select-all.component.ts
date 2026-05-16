import { Component, Input, Output, EventEmitter } from "@angular/core";
import { CommonModule } from "@angular/common";
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

@Component({
  selector: "app-section-select-all",
  standalone: true,
  imports: [CommonModule, CheckboxComponent],
  templateUrl: "./section-select-all.component.html",
})
export class SectionSelectAllComponent {
  @Input() checked = false;
  @Input() indeterminate = false;
  @Input() highlight = false;
  @Input() label: string = "";

  @Output() toggleChange = new EventEmitter<boolean>();

  onToggle(event?: { checked: boolean; event?: MouseEvent } | null): void {
    if (event && typeof event === "object" && "checked" in event) {
      this.checked = event.checked;
    } else {
      this.checked = !this.checked;
    }
    this.toggleChange.emit(this.checked);
  }
}
