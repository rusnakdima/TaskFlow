import { Component, Input, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";

@Component({
  selector: "app-date-anchor",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./date-anchor.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DateAnchorComponent {
  @Input() date = "";
}
