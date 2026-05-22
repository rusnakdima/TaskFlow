import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatRadioModule } from "@angular/material/radio";
import { MatIconModule } from "@angular/material/icon";

@Component({
  selector: "app-visibility-section",
  standalone: true,
  imports: [CommonModule, MatRadioModule, MatIconModule],
  templateUrl: "./visibility-section.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VisibilitySectionComponent {
  @Input() visibility = "private";
  @Input() disabled = false;
  @Output() visibilityChange = new EventEmitter<string>();
}
