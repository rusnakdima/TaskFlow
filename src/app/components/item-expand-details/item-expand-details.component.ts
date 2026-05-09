import { Component, Input, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { ItemType } from "@models/base.model";

@Component({
  selector: "app-item-expand-details",
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: "./item-expand-details.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemExpandDetailsComponent {
  @Input() item: any = null;
  @Input() type: ItemType = "todo";

  get completedCount(): number {
    if (this.type === "todo") return this.item?.completed_tasks_count || 0;
    if (this.type === "task") return this.item?.completed_subtasks_count || 0;
    return 0;
  }

  get totalCount(): number {
    if (this.type === "todo") return this.item?.tasks_count || 0;
    if (this.type === "task") return this.item?.subtasks_count || 0;
    return 0;
  }
}
