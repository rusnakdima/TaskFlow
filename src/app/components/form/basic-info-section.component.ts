import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatIconModule } from "@angular/material/icon";
import { FormsModule } from "@angular/forms";

@Component({
  selector: "app-basic-info-section",
  standalone: true,
  imports: [CommonModule, MatFormFieldModule, MatInputModule, MatIconModule, FormsModule],
  templateUrl: "./basic-info-section.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BasicInfoSectionComponent {
  @Input() title = "";
  @Input() description = "";
  @Input() itemType = "";
  @Output() titleChange = new EventEmitter<string>();
  @Output() descriptionChange = new EventEmitter<string>();
}
