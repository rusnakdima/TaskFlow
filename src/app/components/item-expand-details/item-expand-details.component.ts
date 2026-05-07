import { Component, Input, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";

@Component({
  selector: "app-item-expand-details",
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: "./item-expand-details.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemExpandDetailsComponent {
  @Input() item: any;
  @Input() type: "todo" | "task" | "subtask" = "todo";
}
