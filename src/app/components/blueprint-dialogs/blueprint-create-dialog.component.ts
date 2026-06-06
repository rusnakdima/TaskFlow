import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { AppButtonComponent } from "@components/shared/button/button.component";

@Component({
  selector: "app-blueprint-create-dialog",
  standalone: true,
  imports: [CommonModule, FormsModule, AppButtonComponent],
  templateUrl: "./blueprint-create-dialog.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BlueprintCreateDialogComponent {
  @Input() show = false;
  @Input() name = "";
  @Input() description = "";
  @Output() nameChange = new EventEmitter<string>();
  @Output() descriptionChange = new EventEmitter<string>();
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
}
