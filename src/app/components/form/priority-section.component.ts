import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatRadioModule } from "@angular/material/radio";
import { MatIconModule } from "@angular/material/icon";

@Component({
  selector: "app-priority-section",
  standalone: true,
  imports: [CommonModule, MatRadioModule, MatIconModule],
  templateUrl: "./priority-section.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrioritySectionComponent {
  @Input() priority = "medium";
  @Output() priorityChange = new EventEmitter<string>();
}
