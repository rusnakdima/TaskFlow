import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";

@Component({
  selector: "app-blueprint-apply-dialog",
  standalone: true,
  imports: [CommonModule, FormsModule],
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
