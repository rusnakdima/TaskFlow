/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { RouterModule } from "@angular/router";

/* helpers */
import { Common } from "@helpers/common";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatMenuModule } from "@angular/material/menu";

/* helpers */
import { Subtask } from "@models/subtask";

@Component({
  selector: "app-subtask",
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatMenuModule],
  templateUrl: "./subtask.component.html",
})
export class SubtaskComponent {
  constructor() {}

  @Input() subtask: Subtask | null = null;
  @Input() index: number = 0;

  @Output() deleteSubtaskEvent: EventEmitter<string> = new EventEmitter();

  truncateString = Common.truncateString;

  deleteSubtask() {
    if (this.subtask) {
      this.deleteSubtaskEvent.next(this.subtask.id);
    }
  }
}
