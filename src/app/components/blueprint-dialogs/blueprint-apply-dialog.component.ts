import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { AppButtonComponent } from "@components/shared/button/button.component";

@Component({
  selector: "app-blueprint-apply-dialog",
  standalone: true,
  imports: [CommonModule, FormsModule, AppButtonComponent],
  templateUrl: "./blueprint-apply-dialog.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BlueprintApplyDialogComponent {
  @Input() show = false;
  @Input() title = "";
  @Output() titleChange = new EventEmitter<string>();
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
}
