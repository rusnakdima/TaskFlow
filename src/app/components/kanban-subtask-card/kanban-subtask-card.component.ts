/* sys lib */
import { Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
/* models */
import { TaskStatus, Subtask } from "@entities/generated/api.types";
/* helpers */
import { DateHelper } from "@helpers/date.helper";
import { BaseKanbanCardComponent } from "@components/kanban-card-base/kanban-card-base.component";
/* components */
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";
@Component({
  selector: "app-kanban-subtask-card",
  standalone: true,
  imports: [CommonModule, MatIconModule, CheckboxComponent],
  templateUrl: "./kanban-subtask-card.component.html",
})
export class KanbanSubtaskCardComponent extends BaseKanbanCardComponent {
  @Input() subtask!: Subtask;
  @Input() todo_id: string = "";
  @Input() isSelected: boolean = false;
  override TaskStatus = TaskStatus;
  formatDate = DateHelper.formatDateShort;
  override onStatusCycleClick(event: MouseEvent): void {
    event.stopPropagation();
    this.statusCycle.emit(this.subtask as any);
  }
  override onCheckboxChange(checked: boolean): void {
    this.selectionChange.emit(checked);
  }
  override onCardClick(_event: MouseEvent): void {
    this.cardClick.emit(this.subtask as any);
  }
  override onDragHandleClick(event: MouseEvent): void {
    event.stopPropagation();
  }
}
